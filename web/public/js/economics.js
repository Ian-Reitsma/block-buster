/**
 * Economics & Gating Dashboard
 * Optimized for production with enhanced UX, animations, and error handling
 * 
 * Features:
 * - Real-time gate tracking with smooth transitions
 * - Interactive issuance simulator with debounced updates
 * - Comprehensive error handling with retry logic
 * - Keyboard shortcuts and accessibility
 * - Responsive animations and loading states
 */

(function () {
    if (typeof document === 'undefined') return;

    // ===== Constants =====
    const REFRESH_INTERVAL = 30000; // 30 seconds
    const GATE_HISTORY_INTERVAL = 300000; // 5 minutes
    const MAX_SUPPLY = 40_000_000;
    const BASE_REWARD = 10;
    const HALVING_INTERVAL = 1_000_000;
    const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
    const SIMULATOR_DEBOUNCE = 300; // ms

    const CHART_COLORS = {
        amber: { border: 'rgb(251, 191, 36)', bg: 'rgba(251, 191, 36, 0.1)' },
        cyan: { border: 'rgb(34, 211, 238)', bg: 'rgba(34, 211, 238, 0.1)' },
        purple: { border: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.1)' },
        green: { border: 'rgb(74, 222, 128)', bg: 'rgba(74, 222, 128, 0.1)' },
        red: { border: 'rgb(248, 113, 113)', bg: 'rgba(248, 113, 113, 0.1)' },
        gray: { border: 'rgb(156, 163, 175)', bg: 'rgba(156, 163, 175, 0.1)' }
    };

    // ===== State Management =====
    const state = {
        governorStatus: null,
        blockReward: null,
        liveParams: {
            transactionVolume: 1.0,
            uniqueMiners: 1000,
            blockHeight: 0,
            baseReward: BASE_REWARD
        },
        gateHistory: [],
        marketMetrics: {
            storage: { utilization: 0, rent: 0, history: [] },
            compute: { price: 0, margin: 0, history: [] },
            energy: { kwh: 0, peers: 0, history: [] },
            ads: { cpm: 0, quality: 0, history: [] }
        },
        treasuryBalance: 0,
        charts: {},
        isLoading: false,
        lastUpdate: null,
        refreshTimer: null,
        gateTimer: null,
        lab: {
            preset: 'live',
            liveSnapshot: null,
            scenario: null
        }
    };

    // ===== Issuance Formula (Ported from Rust NetworkIssuanceController) =====
    /**
     * Calculates block reward based on adaptive monetary policy
     * Formula: reward = base * activity * decentralization * decay
     */
    function calculateIssuance(baseReward, activityMultiplier, decentralizationMultiplier, blockHeight, halvingInterval = HALVING_INTERVAL) {
        const halvings = Math.floor(blockHeight / halvingInterval);
        const decay = Math.pow(0.5, halvings);
        
        // Clamp multipliers to protocol ranges
        const activity = Math.max(0.5, Math.min(2.0, activityMultiplier));
        const decentralization = Math.max(0.8, Math.min(1.5, decentralizationMultiplier));
        
        return baseReward * activity * decentralization * decay;
    }

    /**
     * Activity multiplier from transaction volume ratio
     * Uses logarithmic scaling for smooth transitions
     */
    function activityFromVolume(volumeRatio) {
        if (volumeRatio <= 0) return 0.5;
        const base = 1.0 + (Math.log2(volumeRatio) * 0.3);
        return Math.max(0.5, Math.min(2.0, base));
    }

    /**
     * Decentralization multiplier from unique miner count
     * Uses square root scaling for diminishing returns
     */
    function decentralizationFromMiners(minerCount) {
        if (minerCount <= 0) return 0.8;
        const base = 0.8 + (Math.sqrt(minerCount / 1000) * 0.4);
        return Math.max(0.8, Math.min(1.5, base));
    }

    function annualIssuanceFromReward(rewardPerBlock, blockTimeMs) {
        const blockTimeSec = Math.max(0.5, blockTimeMs / 1000);
        const blocksPerYear = SECONDS_PER_YEAR / blockTimeSec;
        return rewardPerBlock * blocksPerYear;
    }

    function supplyProjection({ currentSupply, annualIssuance, years }) {
        const supplies = [];
        let supply = currentSupply;
        for (let y = 0; y <= years; y++) {
            supplies.push({ year: y, supply });
            supply = Math.min(MAX_SUPPLY, supply + annualIssuance);
        }
        return supplies;
    }

    // ===== API Client with Retry Logic =====
    const api = {
        async call(method, params = {}, options = {}) {
            const base = currentApiBase();
            const url = `${base}/rpc`;
            const payload = {
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params
            };

            const maxRetries = options.retries || 2;
            let lastError;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const { res, latencyMs } = await fetchWithTiming(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: options.signal
                    });

                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const data = await res.json();
                    if (data.error) {
                        throw new Error(data.error.message || JSON.stringify(data.error));
                    }

                    return { result: data.result, latencyMs };
                } catch (err) {
                    lastError = err;
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    }
                }
            }

            logError(method, lastError.message);
            throw lastError;
        },

        async governorStatus() {
            return this.call('governor.status');
        },

        async governorDecisions(limit = 100) {
            return this.call('governor.decisions', { limit });
        },

        async blockReward() {
            return this.call('consensus.block_reward');
        },

        async blockHeight() {
            return this.call('consensus.block_height');
        },

        async ledgerSupply() {
            try {
                return await this.call('ledger.supply', {}, { retries: 1 });
            } catch {
                // Fallback: estimate from block height
                const { result } = await this.blockHeight();
                const estimated = result * BASE_REWARD;
                return { result: { circulating: estimated, total: estimated } };
            }
        },

        async marketMetrics() {
            try {
                return await this.call('analytics.market_metrics', {}, { retries: 1 });
            } catch {
                return { result: null };
            }
        },

        async treasuryBalance() {
            try {
                return await this.call('treasury.balance', {}, { retries: 1 });
            } catch {
                return { result: { balance: 0 } };
            }
        }
    };

    // ===== Error Handling =====
    const logError = createErrorLogger({
        drawerId: 'eco-error-drawer',
        listId: 'eco-error-list',
        clearId: 'eco-error-clear'
    });

    // ===== Data Fetching =====
    async function fetchAllData() {
        if (state.isLoading) return;
        
        state.isLoading = true;
        setStatus('REFRESHING');
        const startTime = Date.now();
        
        try {
            // Parallel fetch with proper error isolation
            const results = await Promise.allSettled([
                api.governorStatus(),                          // 0
                api.blockHeight(),                              // 1
                api.call('consensus.stats'),                    // 2
                api.marketMetrics(),                            // 3
                api.treasuryBalance(),                          // 4
                api.call('net.peer_stats_all', [{ offset: 0, limit: 256 }]), //5
                api.call('price_board_get', {}, { retries: 1 }),             //6
            ]);

            const [
                govStatus,
                heightRes,
                statsRes,
                marketMetricsRes,
                treasuryRes,
                peersRes,
                priceRes,
            ] = results;

            const height = heightRes.status === 'fulfilled' ? (heightRes.value.result?.height || 0) : 0;
            const tps = statsRes.status === 'fulfilled' ? (statsRes.value.result?.tps || 0) : 0;
            const peers = peersRes.status === 'fulfilled'
                ? (Array.isArray(peersRes.value.result) ? peersRes.value.result.length : peersRes.value.result?.length || 0)
                : 0;
            const reward = Math.max(0.01, estimateBlockReward({ height, tps, peers }));
            const avgBlockTimeMs = (statsRes.status === 'fulfilled' ? (statsRes.value.result?.avg_block_time_ms || 2000) : 2000);
            const avgBlockTimeSec = avgBlockTimeMs / 1000;
            state.liveParams.avgBlockTime = avgBlockTimeSec;
            state.liveParams.blockTimeMs = avgBlockTimeMs;

            state.blockReward = { reward, block_height: height };
            state.liveParams.blockHeight = height;
            state.liveParams.baseReward = reward;
            state.supply = {
                circulating: height * reward,
                total: MAX_SUPPLY,
            };

            // hydrate lab live snapshot (used by presets/reset)
            const activityMult = state.blockReward?.activity_multiplier || 1.0;
            const decentralMult = state.blockReward?.decentralization_multiplier || 1.0;
            const mempoolFullness = statsRes.status === 'fulfilled'
                ? (statsRes.value.result?.mempool_fullness_pct ?? 50)
                : 50;

            state.lab.liveSnapshot = {
                transactionVolume: activityMult,
                uniqueMiners: Math.max(100, Math.round(Math.pow((decentralMult - 0.8) / 0.4, 2) * 1000) || state.liveParams.uniqueMiners || 1000),
                blockTimeMs: avgBlockTimeMs,
                mempool: mempoolFullness,
                readinessBoost: 0
            };

            if (govStatus.status === 'fulfilled') {
                state.governorStatus = govStatus.value.result;
            }
            if (marketMetricsRes.status === 'fulfilled' && marketMetricsRes.value.result) {
                state.marketMetrics = marketMetricsRes.value.result;
            }
            if (treasuryRes.status === 'fulfilled') {
                state.treasuryBalance = treasuryRes.value.result?.balance || 0;
            }

            state.priceBoard = priceRes.status === 'fulfilled' ? priceRes.value.result : null;

            // Update UI with smooth transitions
            await Promise.all([
                updateMacroMetrics(),
                updateGatingVisual(),
                updateMarketCards(),
                updateTreasury()
            ]);

            // refresh lab snapshot + UI
            updateLabFromLive();

            // Update status
            const elapsed = Date.now() - startTime;
            state.lastUpdate = Date.now();
            setStatus('LIVE');
            setText('eco-updated', `Updated ${elapsed}ms ago`);
            
            // Success toast only on manual refresh
            if (!state.refreshTimer) {
                pushToast('Economics data refreshed', 'info', { ttl: 2000 });
            }

        } catch (err) {
            console.error('[Economics] Failed to fetch ', err);
            setStatus('ERROR');
            pushToast('Failed to load economics data', 'warn');
        } finally {
            state.isLoading = false;
        }
    }

    async function fetchGateHistory() {
        try {
            const { result } = await api.governorDecisions(100);
            if (result && Array.isArray(result)) {
                state.gateHistory = result;
                renderGateHistoryChart();
            }
        } catch (err) {
            console.error('[Economics] Failed to fetch gate history:', err);
        }
    }

    // ===== UI Updates with Animations =====
    function updateMacroMetrics() {
        const { supply, blockReward, governorStatus } = state;

        // Circulating Supply with animation
        const currentSupply = supply?.circulating || 0;
        const supplyPct = ((currentSupply / MAX_SUPPLY) * 100);
        
        animateNumber('eco-supply', currentSupply, formatNumber);
        animateNumber('eco-supply-pct', supplyPct, v => `${v.toFixed(2)}%`);
        animateProgress('eco-supply-bar', supplyPct);
        
        setText('eco-supply-issued', `${formatNumber(currentSupply)} issued`);
        setText('eco-supply-remaining', `${formatNumber(MAX_SUPPLY - currentSupply)} remaining`);

        // Network Status
        let networkStatus = 'Testnet';
        let gatesSummary = '';
        if (governorStatus?.gates) {
            const gates = Object.values(governorStatus.gates);
            const openGates = gates.filter(g => g.state === 'Trade').length;
            const totalGates = gates.length;
            
            if (openGates === totalGates) {
                networkStatus = 'Mainnet';
                gatesSummary = 'All markets open';
            } else if (openGates > 0) {
                networkStatus = 'Beta';
                gatesSummary = `${openGates}/${totalGates} markets open`;
            } else {
                gatesSummary = 'All markets gated';
            }
        }
        
        setText('eco-network-status', networkStatus);
        setText('eco-epoch', governorStatus?.epoch || '—');
        setText('eco-gates-summary', gatesSummary);

        // Block Reward
        const reward = blockReward?.reward || 0;
        const activityMult = blockReward?.activity_multiplier || 1.0;
        const decentralMult = blockReward?.decentralization_multiplier || 1.0;
        
        animateNumber('eco-block-reward', reward, v => v.toFixed(4));
        animateNumber('eco-activity-mult', activityMult, v => `${v.toFixed(2)}x`);
        animateNumber('eco-decentral-mult', decentralMult, v => `${v.toFixed(2)}x`);

        // Issuance trend
        const trendChip = document.getElementById('eco-issuance-trend');
        if (activityMult > 1.1) {
            trendChip.textContent = 'Growing';
            trendChip.className = 'chip chip-pill bg-green-500/20 text-green-400';
        } else if (activityMult < 0.9) {
            trendChip.textContent = 'Declining';
            trendChip.className = 'chip chip-pill bg-orange-500/20 text-orange-400';
        } else {
            trendChip.textContent = 'Stable';
            trendChip.className = 'chip chip-pill bg-gray-500/20 text-gray-400';
        }

        // Update live params for simulator
        state.liveParams.transactionVolume = activityMult;
        state.liveParams.uniqueMiners = Math.round(Math.pow((decentralMult - 0.8) / 0.4, 2) * 1000);
    }

    function updateGatingVisual() {
        const { governorStatus } = state;
        const container = document.getElementById('eco-gates-progress');
        
        if (!governorStatus?.gates) {
            container.innerHTML = '<div class="p-8 text-center text-gray-500"><div class="text-sm">No gate data available</div><div class="text-xs mt-2">Waiting for governor status...</div></div>';
            return;
        }

        const gates = governorStatus.gates;
        const marketNames = {
            storage: { name: 'Storage Market', icon: '💾' },
            compute: { name: 'Compute Market', icon: '⚙️' },
            energy: { name: 'Energy Market', icon: '⚡' },
            ads: { name: 'Ad Marketplace', icon: '📊' }
        };
        
        let html = '';
        for (const [market, data] of Object.entries(gates)) {
            const readiness = (data.readiness || 0) * 100;
            const isOpen = data.state === 'Trade';
            const isNearThreshold = readiness >= 70 && readiness < 80;
            
            // Dynamic color classes
            let statusClass = 'status-gated';
            let readinessClass = 'readiness-critical';
            let barColor = 'bg-gray-500';
            
            if (isOpen) {
                statusClass = 'status-trade';
                readinessClass = 'readiness-excellent';
                barColor = 'bg-green-500';
            } else if (readiness >= 80) {
                statusClass = 'status-rehearsal';
                readinessClass = 'readiness-good';
                barColor = 'bg-yellow-500';
            } else if (isNearThreshold) {
                readinessClass = 'readiness-warning';
                barColor = 'bg-orange-500';
            }
            
            const marketInfo = marketNames[market] || { name: market, icon: '🔹' };
            const gap = isOpen ? 0 : (readiness >= 80 ? 100 - readiness : 80 - readiness);
            
            html += `
                <div class="p-4 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-all" role="article" aria-label="${marketInfo.name} gate status">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl" aria-hidden="true">${marketInfo.icon}</span>
                            <div>
                                <div class="text-sm font-semibold text-white">${marketInfo.name}</div>
                                <span class="text-xs ${statusClass} inline-block px-2 py-0.5 rounded mt-1">${data.state || 'Rehearsal'}</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-2xl font-bold ${readinessClass}">${readiness.toFixed(1)}%</div>
                            <div class="text-xs text-gray-500">readiness</div>
                        </div>
                    </div>
                    <div class="w-full bg-gray-700/30 rounded-full h-3 overflow-hidden relative">
                        <div class="${barColor} h-3 rounded-full gate-progress-bar" style="width: ${readiness}%"></div>
                        <div class="gate-threshold-line"></div>
                    </div>
                    <div class="mt-2 flex items-center justify-between text-xs">
                        <span class="${readinessClass}">
                            ${isOpen ? '✓ Market is open for trading' : isNearThreshold ? '⚠️ Near threshold' : gap > 50 ? '🔒 Gated' : '🔓 Approaching unlock'}
                        </span>
                        <span class="text-gray-500">
                            ${isOpen ? 'Unlocked' : gap > 0 ? `${gap.toFixed(1)}% gap` : 'Ready'}
                        </span>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    function updateMarketCards() {
        const metrics = state.marketMetrics;

        // Storage
        updateMarketCard('storage', {
            util: metrics.storage?.utilization ? `${(metrics.storage.utilization * 100).toFixed(1)}%` : '—',
            rent: metrics.storage?.rent?.toFixed(4) || '—',
            status: state.governorStatus?.gates?.storage?.state || 'Rehearsal'
        });

        // Compute
        updateMarketCard('compute', {
            price: metrics.compute?.price?.toFixed(4) || '—',
            margin: metrics.compute?.margin ? `${(metrics.compute.margin * 100).toFixed(1)}%` : '—',
            status: state.governorStatus?.gates?.compute?.state || 'Rehearsal'
        });

        // Energy
        updateMarketCard('energy', {
            kwh: formatNumber(metrics.energy?.kwh || 0),
            peers: metrics.energy?.peers || '—',
            status: state.governorStatus?.gates?.energy?.state || 'Rehearsal'
        });

        // Ads
        updateMarketCard('ads', {
            cpm: metrics.ads?.cpm?.toFixed(4) || '—',
            quality: metrics.ads?.quality?.toFixed(2) || '—',
            status: state.governorStatus?.gates?.ads?.state || 'Rehearsal'
        });

        // Update market charts with real data
        updateMarketCharts();
    }

    function updateMarketCard(market, data) {
        // Update status chip
        const statusEl = document.getElementById(`eco-${market}-status`);
        if (statusEl) {
            statusEl.textContent = data.status;
            statusEl.className = `chip chip-pill ${data.status === 'Trade' ? 'status-trade' : 'status-rehearsal'}`;
        }

        // Update metrics (specific to each market)
        Object.entries(data).forEach(([key, value]) => {
            if (key !== 'status') {
                const el = document.getElementById(`eco-${market}-${key}`);
                if (el) el.textContent = value;
            }
        });
    }

    function updateTreasury() {
        animateNumber('eco-treasury-balance', state.treasuryBalance, formatNumber);
        
        const fees24h = state.marketMetrics?.fees_24h || 0;
        animateNumber('eco-fees-total', fees24h, formatNumber);
        
        // Fee breakdown
        const breakdown = state.marketMetrics?.fee_breakdown;
        if (breakdown) {
            setText('eco-fees-breakdown', 
                `Storage: ${formatNumber(breakdown.storage || 0)} | Compute: ${formatNumber(breakdown.compute || 0)}`);
        }
        
        const proposalCount = state.governorStatus?.active_proposals || 0;
        setText('eco-proposals-count', proposalCount.toString());
        
        if (proposalCount > 0) {
            setText('eco-proposals-recent', `${proposalCount} proposal${proposalCount > 1 ? 's' : ''} active`);
        } else {
            setText('eco-proposals-recent', 'No active proposals');
        }
    }

    // ===== Chart Rendering =====
    function initCharts() {
        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 750, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderColor: 'rgba(251, 191, 36, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    titleColor: '#fff',
                    bodyColor: '#d1d5db'
                }
            },
            scales: {
                x: { 
                    display: true, 
                    grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false },
                    ticks: { color: '#9ca3af' }
                },
                y: { 
                    display: true, 
                    grid: { color: 'rgba(156, 163, 175, 0.1)', drawBorder: false },
                    ticks: { color: '#9ca3af' }
                }
            }
        };

        // Gate History Chart
        const gateHistoryCtx = document.getElementById('eco-gates-history-chart')?.getContext('2d');
        if (gateHistoryCtx) {
            state.charts.gateHistory = new Chart(gateHistoryCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        { label: 'Storage', data: [], borderColor: CHART_COLORS.amber.border, backgroundColor: CHART_COLORS.amber.bg, tension: 0.4, fill: false },
                        { label: 'Compute', data: [], borderColor: CHART_COLORS.cyan.border, backgroundColor: CHART_COLORS.cyan.bg, tension: 0.4, fill: false },
                        { label: 'Energy', data: [], borderColor: CHART_COLORS.green.border, backgroundColor: CHART_COLORS.green.bg, tension: 0.4, fill: false },
                        { label: 'Ads', data: [], borderColor: CHART_COLORS.purple.border, backgroundColor: CHART_COLORS.purple.bg, tension: 0.4, fill: false }
                    ]
                },
                options: { 
                    ...defaultOptions, 
                    plugins: { ...defaultOptions.plugins, legend: { display: true, labels: { color: '#9ca3af' } } },
                    scales: {
                        ...defaultOptions.scales,
                        y: { ...defaultOptions.scales.y, min: 0, max: 100 }
                    }
                }
            });
        }

        // Simulator Chart
        const simChartCtx = document.getElementById('eco-sim-chart')?.getContext('2d');
        if (simChartCtx) {
            state.charts.simulator = new Chart(simChartCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Live',
                            data: [],
                            borderColor: CHART_COLORS.cyan.border,
                            backgroundColor: CHART_COLORS.cyan.bg,
                            fill: false,
                            tension: 0.35,
                            borderWidth: 2
                        },
                        {
                            label: 'Scenario',
                            data: [],
                            borderColor: CHART_COLORS.amber.border,
                            backgroundColor: CHART_COLORS.amber.bg,
                            fill: true,
                            tension: 0.35,
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    ...defaultOptions,
                    scales: {
                        ...defaultOptions.scales,
                        y: { ...defaultOptions.scales.y, min: 0, max: 40 }
                    }
                }
            });
        }

        // Market charts
        ['storage', 'compute', 'energy', 'ad'].forEach(market => {
            const ctx = document.getElementById(`eco-${market}-chart`)?.getContext('2d');
            if (ctx) {
                state.charts[market] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['W1', 'W2', 'W3', 'W4'],
                        datasets: [{
                            data: [0, 0, 0, 0],
                            backgroundColor: CHART_COLORS.cyan.border,
                            borderRadius: 4
                        }]
                    },
                    options: { 
                        ...defaultOptions, 
                        scales: { x: { display: false }, y: { display: false } },
                        plugins: { tooltip: { enabled: false } }
                    }
                });
            }
        });
    }

    function renderGateHistoryChart() {
        const chart = state.charts.gateHistory;
        if (!chart || !state.gateHistory.length) return;

        const labels = [];
        const data = { storage: [], compute: [], energy: [], ads: [] };

        state.gateHistory.slice(-30).forEach(entry => {
            labels.push(`E${entry.epoch}`);
            data.storage.push((entry.gates?.storage?.readiness || 0) * 100);
            data.compute.push((entry.gates?.compute?.readiness || 0) * 100);
            data.energy.push((entry.gates?.energy?.readiness || 0) * 100);
            data.ads.push((entry.gates?.ads?.readiness || 0) * 100);
        });

        chart.data.labels = labels;
        chart.data.datasets[0].data = data.storage;
        chart.data.datasets[1].data = data.compute;
        chart.data.datasets[2].data = data.energy;
        chart.data.datasets[3].data = data.ads;
        chart.update('none'); // No animation on update
    }

    function updateMarketCharts() {
        // Use real history data if available
        const markets = ['storage', 'compute', 'energy', 'ads'];
        markets.forEach(market => {
            const chartKey = market === 'ads' ? 'ad' : market;
            const chart = state.charts[chartKey];
            if (!chart) return;

            const history = state.marketMetrics[market]?.history;
            if (history && history.length > 0) {
                const last4 = history.slice(-4);
                chart.data.datasets[0].data = last4.map(h => h.value || 0);
                chart.update();
                // Hide empty state
                const emptyEl = document.getElementById(`eco-${chartKey}-empty`);
                if (emptyEl) emptyEl.classList.add('hidden');
            } else {
                // Show empty state
                const emptyEl = document.getElementById(`eco-${chartKey}-empty`);
                if (emptyEl) emptyEl.classList.remove('hidden');
            }
        });
    }

    // ===== Economics Lab (Simulator v2) =====
    let simulatorTimeout = null;

    function getLabInputs() {
        const txn = parseFloat(document.getElementById('eco-sim-txn')?.value || 1);
        const miners = parseInt(document.getElementById('eco-sim-miners')?.value || 1000);
        const blockTimeMs = parseInt(document.getElementById('eco-sim-blocktime')?.value || 2000);
        const mempool = parseInt(document.getElementById('eco-sim-mempool')?.value || 50);
        const readinessBoost = parseInt(document.getElementById('eco-sim-ready')?.value || 0);
        return { txn, miners, blockTimeMs, mempool, readinessBoost };
    }

    function applyLabInputs(inputs) {
        const txnSlider = document.getElementById('eco-sim-txn');
        const minersSlider = document.getElementById('eco-sim-miners');
        const blocktimeSlider = document.getElementById('eco-sim-blocktime');
        const mempoolSlider = document.getElementById('eco-sim-mempool');
        const readySlider = document.getElementById('eco-sim-ready');

        if (txnSlider) txnSlider.value = inputs.txn.toFixed(1);
        if (minersSlider) minersSlider.value = inputs.miners;
        if (blocktimeSlider) blocktimeSlider.value = inputs.blockTimeMs;
        if (mempoolSlider) mempoolSlider.value = inputs.mempool;
        if (readySlider) readySlider.value = inputs.readinessBoost;

        updateSliderVisual(txnSlider);
        updateSliderVisual(minersSlider);
        updateSliderVisual(blocktimeSlider);
        updateSliderVisual(mempoolSlider);
        updateSliderVisual(readySlider);
    }

    function updateLabUI(inputs, computed) {
        setText('eco-sim-txn-value', `${inputs.txn.toFixed(1)}x`);
        setText('eco-sim-miners-value', formatNumber(inputs.miners));
        setText('eco-sim-blocktime-value', `${inputs.blockTimeMs}`);
        setText('eco-sim-mempool-value', `${inputs.mempool}%`);
        setText('eco-sim-ready-value', `${inputs.readinessBoost}%`);
        updateSliderVisual(document.getElementById('eco-sim-txn'));
        updateSliderVisual(document.getElementById('eco-sim-miners'));
        updateSliderVisual(document.getElementById('eco-sim-blocktime'));
        updateSliderVisual(document.getElementById('eco-sim-mempool'));
        updateSliderVisual(document.getElementById('eco-sim-ready'));

        // Metrics
        animateNumber('eco-sim-reward', computed.reward, v => v.toFixed(4));
        animateNumber('eco-sim-inflation', computed.inflation, v => v.toFixed(2) + '%');
        setText('eco-sim-time-to-cap', computed.yearsToCapDisplay);

        // Deltas
        setText('lab-delta-reward', `Reward Δ: ${fmtDelta(computed.reward - computed.baseline.reward)}`);
        setText('lab-delta-inflation', `Inflation Δ: ${fmtDelta(computed.inflation - computed.baseline.inflation)}%`);
        setText('lab-delta-runway', `Cap Runway Δ: ${fmtDelta(computed.yearsToCap - computed.baseline.yearsToCap)} yrs`);

        // Factor bars
        updateFactorBars(computed);

        // Supply projection chart + table
        updateProjection(computed);

        // Gate preview
        updateGatePreview(inputs);
    }

    function fmtDelta(delta) {
        if (!isFinite(delta)) return '—';
        const sign = delta > 0 ? '+' : '';
        return `${sign}${delta.toFixed(2)}`;
    }

    function updateSliderVisual(el) {
        if (!el) return;
        const min = parseFloat(el.min || '0');
        const max = parseFloat(el.max || '100');
        const val = parseFloat(el.value || min);
        const pct = ((val - min) / (max - min)) * 100;
        el.style.setProperty('--val', `${pct}%`);
    }

    function updateFactorBars({ activityMult, decentralMult, decay }) {
        const bars = [
            { id: 'lab-factor-activity', valId: 'lab-factor-activity-val', value: activityMult },
            { id: 'lab-factor-decentral', valId: 'lab-factor-decentral-val', value: decentralMult },
            { id: 'lab-factor-decay', valId: 'lab-factor-decay-val', value: decay }
        ];
        bars.forEach(bar => {
            const fill = document.getElementById(bar.id);
            const label = document.getElementById(bar.valId);
            if (!fill || !label) return;
            const width = Math.min(100, Math.max(0, (bar.value / 2) * 100)); // heuristic scaling
            fill.style.width = `${width}%`;
            label.textContent = bar.value.toFixed(2) + (bar.id.includes('decay') ? 'x' : 'x');
        });
    }

    function updateProjection(computed) {
        const chart = state.charts.simulator;
        if (!chart) return;

        const liveAnnual = computed.baseline.annualIssuance;
        const scenarioAnnual = computed.annualIssuance;
        const currentSupply = state.supply?.circulating || 0;

        const liveProj = supplyProjection({ currentSupply, annualIssuance: liveAnnual, years: 10 });
        const scenarioProj = supplyProjection({ currentSupply, annualIssuance: scenarioAnnual, years: 10 });

        const labels = scenarioProj.map(p => (p.year === 0 ? 'Now' : `Y${p.year}`));
        chart.data.labels = labels;
        chart.data.datasets[0].data = liveProj.map(p => p.supply / 1_000_000);
        chart.data.datasets[1].data = scenarioProj.map(p => p.supply / 1_000_000);
        chart.update();

        const horizons = [
            { years: 1, mintedId: 'lab-runway-1y', remainId: 'lab-remaining-1y' },
            { years: 3, mintedId: 'lab-runway-3y', remainId: 'lab-remaining-3y' },
            { years: 5, mintedId: 'lab-runway-5y', remainId: 'lab-remaining-5y' },
            { years: 10, mintedId: 'lab-runway-10y', remainId: 'lab-remaining-10y' }
        ];
        horizons.forEach(h => {
            const minted = Math.min(MAX_SUPPLY - currentSupply, scenarioAnnual * h.years);
            const remaining = Math.max(0, MAX_SUPPLY - (currentSupply + minted));
            setText(h.mintedId, formatNumber(minted));
            setText(h.remainId, formatNumber(remaining));
        });
    }

    function updateGatePreview(inputs) {
        const gates = state.governorStatus?.gates;
        if (!gates) return;
        const mempoolPenalty = Math.max(0, (inputs.mempool - 60) * 0.3);
        const boost = inputs.readinessBoost;
        const markets = ['storage', 'compute', 'energy', 'ads'];
        markets.forEach(market => {
            const baseReadiness = (gates[market]?.readiness || 0) * 100;
            let adjusted = baseReadiness + boost - mempoolPenalty;
            adjusted = Math.max(0, Math.min(100, adjusted));
            const bar = document.getElementById(`lab-gate-${market}-bar`);
            const meta = document.getElementById(`lab-gate-${market}-meta`);
            if (bar) bar.style.width = `${adjusted}%`;
            if (meta) meta.textContent = `${adjusted.toFixed(1)}% readiness`;
        });
    }

    function computeLabScenario() {
        const inputs = getLabInputs();
        const blockHeight = state.liveParams.blockHeight || 0;
        const baseReward = state.liveParams.baseReward || BASE_REWARD;

        const activityMult = activityFromVolume(inputs.txn);
        const decentralMult = decentralizationFromMiners(inputs.miners);
        const decay = Math.pow(0.5, Math.floor(blockHeight / HALVING_INTERVAL));

        const reward = calculateIssuance(baseReward, activityMult, decentralMult, blockHeight);
        const annualIssuance = annualIssuanceFromReward(reward, inputs.blockTimeMs);
        const currentSupply = state.supply?.circulating || (blockHeight * baseReward);
        const inflation = currentSupply > 0 ? (annualIssuance / currentSupply) * 100 : 0;
        const yearsToCap = annualIssuance > 0 ? (MAX_SUPPLY - currentSupply) / annualIssuance : Infinity;
        const yearsToCapDisplay = isFinite(yearsToCap) && yearsToCap > 0 ? yearsToCap.toFixed(1) : '∞';

        // Baseline (live snapshot)
        const live = state.lab.liveSnapshot || {};
        const liveActivity = live.transactionVolume || 1.0;
        const liveMiners = live.uniqueMiners || 1000;
        const liveBlockTime = live.blockTimeMs || 2000;
        const liveActivityMult = activityFromVolume(liveActivity);
        const liveDecentral = decentralizationFromMiners(liveMiners);
        const liveReward = calculateIssuance(baseReward, liveActivityMult, liveDecentral, blockHeight);
        const liveAnnual = annualIssuanceFromReward(liveReward, liveBlockTime);
        const liveInflation = currentSupply > 0 ? (liveAnnual / currentSupply) * 100 : 0;
        const liveYears = liveAnnual > 0 ? (MAX_SUPPLY - currentSupply) / liveAnnual : Infinity;

        return {
            inputs,
            reward,
            activityMult,
            decentralMult,
            decay,
            annualIssuance,
            inflation,
            yearsToCap,
            yearsToCapDisplay,
            baseline: {
                reward: liveReward,
                annualIssuance: liveAnnual,
                inflation: liveInflation,
                yearsToCap: liveYears
            }
        };
    }

    function updateLab() {
        clearTimeout(simulatorTimeout);
        simulatorTimeout = setTimeout(() => {
            const computed = computeLabScenario();
            state.lab.scenario = computed;
            updateLabUI(computed.inputs, computed);
        }, SIMULATOR_DEBOUNCE);
    }

    function bindLabControls() {
        ['eco-sim-txn', 'eco-sim-miners', 'eco-sim-blocktime', 'eco-sim-mempool', 'eco-sim-ready'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', (e) => {
                updateSliderVisual(e.target);
                updateLab();
            });
        });

        // reset button
        document.getElementById('eco-lab-reset')?.addEventListener('click', () => {
            updateLabFromLive();
            pushToast('Lab reset to live snapshot', 'info', { ttl: 2000 });
        });

        // presets
        const presets = document.querySelectorAll('.lab-chip');
        presets.forEach(chip => {
            chip.addEventListener('click', () => applyPreset(chip.dataset.preset));
            chip.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applyPreset(chip.dataset.preset);
                }
            });
        });
    }

    function applyPreset(name) {
        const live = state.lab.liveSnapshot || {
            transactionVolume: 1,
            uniqueMiners: 1000,
            blockTimeMs: 2000,
            mempool: 50,
            readinessBoost: 0
        };
        const presets = {
            live: { ...live },
            surge: { ...live, transactionVolume: Math.min(5, live.transactionVolume * 2.5), blockTimeMs: Math.max(800, live.blockTimeMs * 0.7), mempool: 65, readinessBoost: 8 },
            validator_drop: { ...live, uniqueMiners: Math.max(100, Math.round(live.uniqueMiners * 0.6)), mempool: 40, readinessBoost: -5 },
            bear: { ...live, transactionVolume: Math.max(0.5, live.transactionVolume * 0.7), blockTimeMs: Math.min(2800, live.blockTimeMs * 1.1), mempool: 30, readinessBoost: -8 },
            unlock_push: { ...live, transactionVolume: live.transactionVolume * 1.3, blockTimeMs: Math.max(1200, live.blockTimeMs * 0.9), readinessBoost: 15, mempool: 55 }
        };
        const picked = presets[name] || presets.live;
        state.lab.preset = name || 'live';
        document.querySelectorAll('.lab-chip').forEach(chip => chip.setAttribute('aria-pressed', chip.dataset.preset === state.lab.preset ? 'true' : 'false'));
        applyLabInputs(picked);
        updateLab();
    }

    function updateLabFromLive() {
        if (!state.lab.liveSnapshot) return;
        applyLabInputs(state.lab.liveSnapshot);
        document.querySelectorAll('.lab-chip').forEach(chip => chip.setAttribute('aria-pressed', chip.dataset.preset === 'live' ? 'true' : 'false'));
        state.lab.preset = 'live';
        updateLab();
    }

    // ===== Utility Functions =====
    function formatNumber(num) {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
        return num.toFixed(0);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setStatus(status) {
        const statusEl = document.getElementById('eco-status');
        if (!statusEl) return;
        
        statusEl.textContent = status;
        statusEl.className = 'status-pill';
        
        switch (status) {
            case 'LIVE':
                statusEl.classList.add('status-ok');
                break;
            case 'REFRESHING':
                statusEl.classList.add('status-info');
                break;
            case 'ERROR':
                statusEl.classList.add('status-warn');
                break;
            default:
                statusEl.classList.add('status-info');
        }
    }

    function animateNumber(id, targetValue, formatter = v => v) {
        const el = document.getElementById(id);
        if (!el) return;

        const currentText = el.textContent;
        const currentValue = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
        
        if (Math.abs(targetValue - currentValue) < 0.01) {
            el.textContent = formatter(targetValue);
            return;
        }

        const duration = 500;
        const steps = 20;
        const stepValue = (targetValue - currentValue) / steps;
        const stepDuration = duration / steps;
        let step = 0;

        const interval = setInterval(() => {
            step++;
            const newValue = currentValue + (stepValue * step);
            el.textContent = formatter(newValue);
            
            if (step >= steps) {
                clearInterval(interval);
                el.textContent = formatter(targetValue);
            }
        }, stepDuration);
    }

    function animateProgress(id, targetPct) {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Smooth CSS transition
        el.style.width = `${Math.min(100, Math.max(0, targetPct))}%`;
    }

    // ===== Keyboard Shortcuts =====
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                fetchAllData();
                fetchGateHistory();
            }
        });
    }

    // ===== Auto-refresh Logic =====
    function startAutoRefresh() {
        // Clear existing timers
        if (state.refreshTimer) clearInterval(state.refreshTimer);
        if (state.gateTimer) clearInterval(state.gateTimer);

        // Set up new timers
        state.refreshTimer = setInterval(fetchAllData, REFRESH_INTERVAL);
        state.gateTimer = setInterval(fetchGateHistory, GATE_HISTORY_INTERVAL);
    }

    function stopAutoRefresh() {
        if (state.refreshTimer) clearInterval(state.refreshTimer);
        if (state.gateTimer) clearInterval(state.gateTimer);
        state.refreshTimer = null;
        state.gateTimer = null;
    }

    // ===== Visibility Handling (pause when tab hidden) =====
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAutoRefresh();
        } else {
            fetchAllData();
            fetchGateHistory();
            startAutoRefresh();
        }
    });

    // ===== Initialization =====
    function init() {
        console.log('[Economics] Initializing dashboard...');
        
        // Bind refresh buttons
        document.getElementById('eco-refresh-all')?.addEventListener('click', () => {
            fetchAllData();
            fetchGateHistory();
        });
        document.getElementById('eco-gates-refresh')?.addEventListener('click', () => {
            fetchGateHistory();
        });

        // Initialize components
        initCharts();
        bindLabControls();
        initKeyboardShortcuts();

        // Initial data fetch
        setStatus('INITIALIZING');
        Promise.all([
            fetchAllData(),
            fetchGateHistory()
        ]).then(() => {
            updateLabFromLive();
            console.log('[Economics] Dashboard ready');
        }).catch(err => {
            console.error('[Economics] Initialization failed:', err);
            setStatus('ERROR');
        });

        // Start auto-refresh
        startAutoRefresh();
    }

    // Wait for DOM and dependencies
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for debugging
    window.economicsDashboard = {
        state,
        api,
        fetchAllData,
        fetchGateHistory,
        calculateIssuance,
        activityFromVolume,
        decentralizationFromMiners,
        startAutoRefresh,
        stopAutoRefresh
    };
})();
