# Optimization Priority Matrix

**ROI-ranked actionable items. Time estimates for solo 10x dev.**

---

## Impact Calculation

```
Score = (Performance Gain × User Impact × Maintainability) / Implementation Time
```

**Performance Gain**: 1-10 (10 = 10x faster)  
**User Impact**: 1-10 (10 = affects all users, all pages)  
**Maintainability**: 1-10 (10 = makes future work easier)  
**Implementation Time**: hours

---

## Tier S: Do These First (Score > 50)

### 1. Fix Layout Thrashing
**Score**: 94  
**Time**: 2h  
**Impact**: -45ms per update × 12 updates/min = 540ms/min saved  
**Files**: `dashboard.js`, `network_health.js`  
**Complexity**: Low

```javascript
// Pattern: Batch reads, then batch writes in rAF
requestAnimationFrame(() => {
  const measurements = ids.map(id => document.getElementById(id).offsetWidth);
  requestAnimationFrame(() => {
    ids.forEach((id, i) => updateElement(id, measurements[i]));
  });
});
```

**Verification**: Chrome DevTools Performance tab, look for "Recalculate Style" < 16ms.

---

### 2. Parallelize API Polling
**Score**: 88  
**Time**: 1h  
**Impact**: 680ms → 180ms per poll = -74%  
**Files**: `dashboard.js`  
**Complexity**: Trivial

```javascript
const [health, network, gates] = await Promise.all([
  fetch('/health').then(r => r.json()),
  fetch('/theblock/network').then(r => r.json()),
  fetch('/theblock/gates').then(r => r.json())
]);
```

**Verification**: Network tab, check "Time" column, all start at ~same time.

---

### 3. Purge Unused Tailwind
**Score**: 72  
**Time**: 1h  
**Impact**: -24KB CSS, -52ms parse  
**Files**: `tailwind.config.js`  
**Complexity**: Low

```javascript
// Add to tailwind.config.js
content: ['./public/**/*.html', './public/js/**/*.js'],
safelist: [/* only dynamic classes */]
```

**Build**: `npx tailwindcss -i src -o dist --minify`  
**Verification**: `ls -lh dist/tailwind.min.css` should be ~140KB (was 348KB).

---

### 4. Service Worker
**Score**: 68  
**Time**: 8h (includes testing)  
**Impact**: Repeat visit 1.2s → 0.3s = -75%  
**Files**: `sw.js` (new), `sw-register.js` (new)  
**Complexity**: Medium

**Strategy**:  
- Static assets: Cache-first  
- API: Stale-while-revalidate (60s TTL)  
- Version cache name on deploy

**Verification**: Chrome DevTools → Application → Service Workers, check "Offline" works.

---

## Tier A: High Impact (Score 30-50)

### 5. Critical CSS Extraction
**Score**: 48  
**Time**: 4h  
**Impact**: -70ms FCP  
**Files**: All HTML  
**Complexity**: Medium

```bash
npx critical dashboard.html --inline --extract --minify
```

Inlines ~8KB of above-the-fold CSS, defers rest.

---

### 6. WebSocket Real-Time
**Score**: 42  
**Time**: 16h (backend + frontend)  
**Impact**: 5000ms latency → 100ms = -98%  
**Files**: `websocket.rs` (backend), `dashboard-ws.js` (frontend)  
**Complexity**: High

**Backend**: Tokio + Tungstenite for Rust  
**Frontend**: Auto-reconnect with exponential backoff

**Fallback**: Feature flag to polling if WS unavailable.

---

### 7. Lazy Load Chart.js
**Score**: 38  
**Time**: 2h  
**Impact**: -180ms parse for 40% of users  
**Files**: `chart-loader.js` (new)  
**Complexity**: Low

```javascript
const Chart = await import('./vendor/chart.min.js');
```

Defer until chart tab clicked.

---

### 8. Implement AppState
**Score**: 35  
**Time**: 8h  
**Impact**: Eliminates duplicate fetches, cleaner code  
**Files**: `state.js` (new), refactor all components  
**Complexity**: Medium

**Pattern**: Observable store with pub/sub.

---

## Tier B: Quality of Life (Score 20-30)

### 9. Component Lifecycle
**Score**: 28  
**Time**: 8h  
**Impact**: Prevents memory leaks, easier debugging  
**Files**: `lifecycle.js` (new)  
**Complexity**: Medium

**Pattern**: Base class with mount/unmount hooks, auto-cleanup.

---

### 10. Error Boundary
**Score**: 25  
**Time**: 4h  
**Impact**: Production stability, automatic error reporting  
**Files**: `errors.js` (new)  
**Complexity**: Low

**Pattern**: Centralized catch, debounced reporting to backend.

---

### 11. Declarative Binding
**Score**: 24  
**Time**: 6h  
**Impact**: -50% boilerplate, fewer bugs  
**Files**: `bind.js` (new)  
**Complexity**: Low

```html
<div data-bind="health.errors" data-format="number"></div>
```

Single `bind(element, data)` call updates all bindings.

---

### 12. Brotli Compression
**Score**: 22  
**Time**: 1h (nginx config)  
**Impact**: -6KB per asset vs gzip  
**Files**: `nginx.conf`  
**Complexity**: Trivial

```nginx
brotli on;
brotli_comp_level 6;
```

---

## Tier C: Nice to Have (Score 10-20)

### 13. HTTP/2 Server Push
**Score**: 18  
**Time**: 2h  
**Impact**: -100ms RTT  
**Complexity**: Low (if backend supports)

**Warning**: Don't over-push. Only critical CSS/JS.

---

### 14. Feature Flags
**Score**: 16  
**Time**: 4h  
**Impact**: Safer rollouts, A/B testing  
**Files**: `features.js` (new)  
**Complexity**: Low

LocalStorage overrides for testing.

---

### 15. Intelligent Prefetching
**Score**: 15  
**Time**: 3h  
**Impact**: Instant navigation (page already cached)  
**Files**: `prefetch.js` (new)  
**Complexity**: Low

**Triggers**: Hover (high intent), visible (low intent), idle.

---

### 16. Bundle Size CI
**Score**: 14  
**Time**: 2h  
**Impact**: Prevents regressions  
**Files**: `.github/workflows/performance-budget.yml`  
**Complexity**: Low

Fails PR if bundle > budget.

---

### 17. RUM (Real User Monitoring)
**Score**: 12  
**Time**: 3h  
**Impact**: Visibility into prod performance  
**Files**: `rum.js` (new)  
**Complexity**: Low

Report Web Vitals to backend via `sendBeacon()`.

---

## Tier D: Diminishing Returns (Score < 10)

### 18. HTTP/3 + QUIC
**Score**: 8  
**Time**: 4h (if infra supports)  
**Impact**: -20% latency on mobile  
**Complexity**: Medium (infra dependent)

Requires nginx/CDN support.

---

### 19. Image Optimization
**Score**: 6  
**Time**: 2h  
**Impact**: Minimal (no images currently)  
**Complexity**: Low

Preemptive: WebP/AVIF with `<picture>` fallback.

---

### 20. Virtual Scrolling
**Score**: 4  
**Time**: 8h  
**Impact**: Only matters for 1000+ row tables  
**Files**: `virtual-scroll.js` (new)  
**Complexity**: High

Overkill unless rendering massive datasets.

---

## Quick Reference: 1-Week Sprint

**Day 1** (8h):  
- [2h] Fix layout thrashing (#1)  
- [1h] Parallelize polling (#2)  
- [1h] Purge Tailwind (#3)  
- [4h] Critical CSS (#5)

**Day 2-3** (16h):  
- [16h] WebSocket implementation (#6)

**Day 4** (8h):  
- [8h] Service Worker (#4)

**Day 5** (8h):  
- [8h] AppState + refactor (#8)

**Total Impact**:
- TTI: 1.2s → 0.4s (-67%)  
- FCP: 0.9s → 0.5s (-44%)  
- Bundle: 400KB → 180KB (-55%)  
- Latency: 5s → 100ms (-98%)

---

## Quick Reference: 1-Day Quick Wins

**Morning** (4h):  
- [2h] Fix layout thrashing  
- [1h] Parallelize polling  
- [1h] Purge Tailwind

**Afternoon** (4h):  
- [2h] Lazy load Chart.js  
- [1h] Brotli compression  
- [1h] Bundle size CI

**Total Impact**:  
- TTI: 1.2s → 0.8s (-33%)  
- Bundle: 400KB → 220KB (-45%)  
- Poll time: 680ms → 180ms (-74%)

---

## Metrics to Track

### Before Optimization (Baseline)
```
TTI: 1.2s
FCP: 0.9s
LCP: 1.5s
Total Bundle: 400KB gzipped
Poll Latency: 680ms
Memory: 45MB
```

### After Tier S (Target)
```
TTI: 0.5s (-58%)
FCP: 0.5s (-44%)
LCP: 0.8s (-47%)
Total Bundle: 180KB (-55%)
Poll Latency: 100ms (-85%)
Memory: 38MB (-16%)
```

### After Full Implementation (Aspirational)
```
TTI: 0.3s (-75%)
FCP: 0.4s (-56%)
LCP: 0.6s (-60%)
Total Bundle: 150KB (-62%)
Poll Latency: 0ms (WebSocket push)
Memory: 35MB (-22%)
```

---

## Common Pitfalls

### 1. Premature Optimization
**Bad**: Optimizing code that runs once on page load.  
**Good**: Optimize hot paths (polling, rendering loops).

### 2. Over-Engineering
**Bad**: Adding React for 3 interactive components.  
**Good**: Vanilla JS with surgical updates.

### 3. No Measurement
**Bad**: "Feels faster" after change.  
**Good**: Lighthouse before/after, Chrome DevTools Performance tab.

### 4. Breaking Change Without Fallback
**Bad**: Deploy WebSocket, breaks for 5% of users without support.  
**Good**: Feature flag with polling fallback.

### 5. Ignoring Mobile
**Bad**: Optimize for desktop dev machine only.  
**Good**: Test on real mobile device or 4x CPU throttle.

---

## Testing Checklist

### Per Optimization
- [ ] Measure before (Lighthouse, DevTools)
- [ ] Implement change
- [ ] Measure after (same conditions)
- [ ] Calculate delta (should match estimate ±20%)
- [ ] Test on mobile (real device or throttled)
- [ ] Check for regressions (other metrics didn't degrade)
- [ ] Document result (update this file)

### Full Suite
- [ ] All pages load without console errors
- [ ] Service Worker caches correctly
- [ ] Offline mode works (if implemented)
- [ ] WebSocket auto-reconnects (if implemented)
- [ ] Error boundary catches errors gracefully
- [ ] Memory leaks absent (heap snapshot comparison)
- [ ] Accessibility maintained (WCAG 2.1 AA)
- [ ] Cross-browser tested (Chrome, Firefox, Safari)

---

## Roll-Forward Strategy

**Week 1**: Tier S optimizations  
**Week 2**: Service Worker + Critical CSS  
**Week 3**: WebSocket + AppState  
**Week 4**: Remaining Tier A  
**Week 5**: Polish + monitoring

**Rollback Plan**: Feature flags allow instant disable of new features.

---

## Decision Matrix

| Optimization | Effort | Impact | Risk | Priority |
|--------------|--------|--------|------|----------|
| Layout thrashing | Low | High | Low | **NOW** |
| Parallel polling | Low | High | Low | **NOW** |
| Purge Tailwind | Low | Medium | Low | **NOW** |
| Service Worker | Medium | High | Medium | Week 1 |
| Critical CSS | Medium | Medium | Low | Week 1 |
| WebSocket | High | Very High | High | Week 2 |
| AppState | Medium | Medium | Medium | Week 2 |
| Chart lazy load | Low | Medium | Low | Week 3 |
| Error boundary | Low | Medium | Low | Week 3 |
| Lifecycle | Medium | Low | Low | Week 4 |
| Declarative bind | Medium | Low | Low | Week 4 |

**Risk**:  
- **Low**: Easy to test, minimal surface area  
- **Medium**: Requires integration testing  
- **High**: Changes core architecture, needs gradual rollout

---

## Final Notes

1. **Measure everything**: No optimization without before/after metrics.
2. **Ship iteratively**: Don't batch 10 changes, ship daily.
3. **Feature flags**: Every risky change behind flag.
4. **Real devices**: Dev machine is 10x faster than user's phone.
5. **User impact > vanity metrics**: 1s TTI improvement > perfect Lighthouse score.

**ROI compounds**. Each optimization makes next one easier. After Tier S, you'll have:  
- Clean state management (easier to add features)  
- No memory leaks (stable long-running sessions)  
- Fast feedback loop (instant deploys with SW)
- Production visibility (RUM metrics)

**Ship Tier S this week. Rest is bonus.**
