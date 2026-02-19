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
    const BLOCKS_PER_YEAR = 365 * 24 * 60 * 6; // 10s block time
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
        gateTimer: null
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
                api.governorStatus(),
                api.blockReward(),
                api.ledgerSupply(),
                api.marketMetrics(),
                api.treasuryBalance()
            ]);

            // Process results
            const [govStatus, blockRewardRes, supplyRes, marketMetricsRes, treasuryRes] = results;

            if (govStatus.status === 'fulfilled') {
                state.governorStatus = govStatus.value.result;
            }
            if (blockRewardRes.status === 'fulfilled') {
                state.blockReward = blockRewardRes.value.result;
                state.liveParams.blockHeight = blockRewardRes.value.result?.block_height || 0;
                state.liveParams.baseReward = blockRewardRes.value.result?.base || BASE_REWARD;
            }
            if (supplyRes.status === 'fulfilled') {
                state.supply = supplyRes.value.result;
            }
            if (marketMetricsRes.status === 'fulfilled' && marketMetricsRes.value.result) {
                state.marketMetrics = marketMetricsRes.value.result;
            }
            if (treasuryRes.status === 'fulfilled') {
                state.treasuryBalance = treasuryRes.value.result?.balance || 0;
            }

            // Update UI with smooth transitions
            await Promise.all([
                updateMacroMetrics(),
                updateGatingVisual(),
                updateMarketCards(),
                updateTreasury()
            ]);

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
        const currentSupply = supply?.circulating || (state.liveParams.blockHeight * BASE_REWARD);
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
        const reward = blockReward?.reward || BASE_REWARD;
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
                 {
                    labels: [],
                    datasets: [
                        { label: 'Storage',  [], borderColor: CHART_COLORS.amber.border, backgroundColor: CHART_COLORS.amber.bg, tension: 0.4, fill: false },
                        { label: 'Compute',  [], borderColor: CHART_COLORS.cyan.border, backgroundColor: CHART_COLORS.cyan.bg, tension: 0.4, fill: false },
                        { label: 'Energy',  [], borderColor: CHART_COLORS.green.border, backgroundColor: CHART_COLORS.green.bg, tension: 0.4, fill: false },
                        { label: 'Ads',  [], borderColor: CHART_COLORS.purple.border, backgroundColor: CHART_COLORS.purple.bg, tension: 0.4, fill: false }
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
                 {
                    labels: [],
                    datasets: [{
                        label: 'Projected Supply (M BLOCK)',
                         [],
                        borderColor: CHART_COLORS.amber.border,
                        backgroundColor: CHART_COLORS.amber.bg,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2
                    }]
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
                     {
                        labels: ['W1', 'W2', 'W3', 'W4'],
                        datasets: [{
                             [0, 0, 0, 0],
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
        const markets = ['storage', 'compute', 'energy', 'ad'];
        markets.forEach(market => {
            const chart = state.charts[market];
            if (!chart) return;

            const history = state.marketMetrics[market]?.history;
            if (history && history.length > 0) {
                const last4 = history.slice(-4);
                chart.data.datasets[0].data = last4.map(h => h.value || 0);
                chart.update();
                // Hide empty state
                const emptyEl = document.getElementById(`eco-${market}-empty`);
                if (emptyEl) emptyEl.classList.add('hidden');
            } else {
                // Show empty state
                const emptyEl = document.getElementById(`eco-${market}-empty`);
                if (emptyEl) emptyEl.classList.remove('hidden');
            }
        });
    }

    // ===== Interactive Simulator =====
    let simulatorTimeout = null;

    function initSimulator() {
        const txnSlider = document.getElementById('eco-sim-txn');
        const minersSlider = document.getElementById('eco-sim-miners');
        const resetBtn = document.getElementById('eco-sim-reset');

        function updateSimulator() {
            clearTimeout(simulatorTimeout);
            simulatorTimeout = setTimeout(() => {
                const txnMult = parseFloat(txnSlider.value);
                const miners = parseInt(minersSlider.value);

                // Update labels
                setText('eco-sim-txn-value', `${txnMult.toFixed(1)}x`);
                setText('eco-sim-miners-value', formatNumber(miners));

                // Calculate projections
                const activityMult = activityFromVolume(txnMult);
                const decentralMult = decentralizationFromMiners(miners);
                const blockHeight = state.liveParams.blockHeight;
                const baseReward = state.liveParams.baseReward;
                
                const projectedReward = calculateIssuance(baseReward, activityMult, decentralMult, blockHeight);
                
                // Update formula display
                setText('formula-activity', activityMult.toFixed(2));
                setText('formula-decentral', decentralMult.toFixed(2));

                // Annual inflation
                const annualIssuance = projectedReward * BLOCKS_PER_YEAR;
                const currentSupply = blockHeight * baseReward;
                const inflation = currentSupply > 0 ? (annualIssuance / currentSupply) * 100 : 0;

                // Time to cap
                const remainingSupply = MAX_SUPPLY - currentSupply;
                const yearsToCapRaw = annualIssuance > 0 ? remainingSupply / annualIssuance : Infinity;
                const yearsToCapDisplay = isFinite(yearsToCapRaw) && yearsToCapRaw > 0 ? yearsToCapRaw.toFixed(1) : '∞';

                // Update metrics with animation
                animateNumber('eco-sim-reward', projectedReward, v => v.toFixed(4));
                animateNumber('eco-sim-inflation', inflation, v => v.toFixed(2) + '%');
                setText('eco-sim-time-to-cap', yearsToCapDisplay);

                // Update chart
                updateSimulatorChart(projectedReward, annualIssuance, currentSupply);
            }, SIMULATOR_DEBOUNCE);
        }

        function updateSimulatorChart(reward, annualIssuance, currentSupply) {
            const chart = state.charts.simulator;
            if (!chart) return;

            const years = [];
            const supplies = [];
            let supply = currentSupply;

            for (let y = 0; y <= 10; y++) {
                years.push(y === 0 ? 'Now' : `Y${y}`);
                supplies.push(supply / 1_000_000);
                supply += annualIssuance;
                if (supply >= MAX_SUPPLY) {
                    supply = MAX_SUPPLY;
                    years.push(`Y${y + 1}`);
                    supplies.push(supply / 1_000_000);
                    break;
                }
            }

            chart.data.labels = years;
            chart.data.datasets[0].data = supplies;
            chart.update();
        }

        // Wire controls
        txnSlider?.addEventListener('input', updateSimulator);
        minersSlider?.addEventListener('input', updateSimulator);
        resetBtn?.addEventListener('click', () => {
            txnSlider.value = state.liveParams.transactionVolume.toFixed(1);
            minersSlider.value = state.liveParams.uniqueMiners.toString();
            updateSimulator();
            pushToast('Simulator reset to live network data', 'info', { ttl: 2000 });
        });

        // Initial render
        updateSimulator();
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
        initSimulator();
        initKeyboardShortcuts();

        // Initial data fetch
        setStatus('INITIALIZING');
        Promise.all([
            fetchAllData(),
            fetchGateHistory()
        ]).then(() => {
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
