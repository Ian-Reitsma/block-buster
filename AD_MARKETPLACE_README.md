# Ad Marketplace - The Block's Decentralized Advertising Platform

## Overview

The Ad Marketplace is a next-generation advertising platform built on The Block L1 blockchain that revolutionizes digital advertising through decentralization, privacy-first design, and on-chain transparency.

## Why It's 10x Better Than Google Ads

### 1. **Privacy-First Architecture**
- **Zero Individual Tracking**: Uses cohort-based targeting instead of tracking individuals
- **No PII Collection**: All targeting is based on anonymous audience segments
- **On-Chain Transparency**: Every impression is verifiable via blockchain receipts
- **GDPR/CCPA Compliant by Design**: Privacy is built into the core architecture

### 2. **Decentralized & Fraud-Proof**
- **Blockchain Attribution**: Immutable proof of ad delivery
- **ML-Powered Fraud Detection**: Real-time identification of bot traffic
- **No Middleman**: Direct advertiser-to-publisher economics
- **Automated Dispute Resolution**: Smart contract enforcement

### 3. **Unified Platform**
Google splits Ads and Analytics into separate products. We combine:
- Campaign management
- Real-time analytics
- Predictive insights
- A/B testing framework
- Budget optimization
- Fraud detection

All in one seamless interface.

### 4. **Advanced Features**
- **Real-Time Bidding**: Dynamic ad slot auctions with microsecond latency
- **Cohort Analytics**: Privacy-preserving audience insights
- **Predictive ROI**: ML models forecast campaign performance
- **Attribution Verification**: On-chain proof of every conversion
- **Automated Optimization**: AI-driven budget allocation

## Architecture

### Frontend Components

```
web/src/
├── pages/
│   ├── AdMarketplace.tsx          # Main marketplace interface
│   └── AdMarketplace.css          # Styling
├── components/
│   ├── CampaignForm.tsx           # Campaign creation wizard
│   └── CampaignForm.css           # Form styling
├── hooks/
│   └── useAdMarket.ts             # React hooks for ad market
└── api/
    ├── adMarket.ts                # RPC client for ad_market namespace
    └── config.ts                  # API configuration
```

### Backend Integration

The frontend integrates with The Block's `ad_market` RPC namespace:

```rust
// RPC Methods (from node/src/rpc/ad_market.rs)
ad_market.submit_bid              // Submit auction bids
ad_market.cohort_query            // Query audience cohorts
ad_market.policy_snapshot         // Get compliance policies
ad_market.campaign_stats          // Fetch campaign analytics
ad_market.impression_receipts     // Get on-chain receipts
ad_market.fraud_reports           // Retrieve fraud alerts
```

## Features Breakdown

### 1. Overview Dashboard
- **Real-time metrics**: Spend, impressions, CTR, conversions, ROI
- **Performance charts**: 30-day revenue vs. spend visualization
- **Top campaigns**: Sortable table by performance
- **AI insights**: Opportunity detection and warnings

### 2. Campaign Management
- **Multi-step wizard**: Name, budget, targeting, creatives, review
- **Budget controls**: Total budget + optional daily caps
- **Cohort targeting**: 10+ predefined audience segments
- **Geo/device filters**: Region and device type selection
- **Creative management**: IPFS storage integration
- **Status controls**: Pause, resume, modify campaigns

### 3. Advanced Analytics
- **Conversion funnel**: Visual pipeline from impression → conversion
- **Cohort performance**: CTR, conversion rate, CPC, ROI by segment
- **Fraud detection**: Real-time alerts with severity levels
- **Attribution tracking**: On-chain verification of results

### 4. Real-Time Bidding (Coming Soon)
- Live auction participation
- Dynamic bidding strategies
- Slot performance predictions
- Automated bid optimization

### 5. Creative Management (Coming Soon)
- Multi-format support (banner, video, native, text)
- A/B testing with statistical significance
- Dynamic creative optimization (DCO)
- Performance analytics per creative

### 6. AI Insights
- **Opportunity detection**: Identifies untapped cohorts
- **Budget warnings**: Alerts on pacing issues
- **Predictive analytics**: Forecasts conversion trends
- **Optimization suggestions**: Actionable recommendations

## Usage

### Creating a Campaign

1. Click "+ Create Campaign" button
2. **Step 1 - Basics**: Enter name, budget, and schedule
3. **Step 2 - Targeting**: Select cohorts, regions, and devices
4. **Step 3 - Creatives**: Upload creative assets (IPFS CID)
5. **Step 4 - Review**: Confirm details and launch

### Monitoring Performance

1. Navigate to "Analytics" tab
2. View conversion funnel
3. Analyze cohort performance
4. Check fraud alerts
5. Verify on-chain receipts

### Budget Management

```typescript
// Update campaign budget via API
await adMarketAPI.updateBudget('campaign-id', 50000);

// Check budget status
const status = await adMarketAPI.getBudgetStatus('campaign-id');
console.log(status.remaining); // Available budget
```

## RPC Integration

### Submitting Bids

```typescript
import { adMarketAPI } from './api/adMarket';

const bid = {
  campaign_id: 'camp-001',
  slot_id: 'slot-xyz',
  cohort: 'tech_enthusiasts',
  bid_amount: 1500000, // 1.5 BLOCK in microBLOCK
  max_impressions: 10000,
  creative_cid: 'QmXxx...'
};

const result = await adMarketAPI.submitBid(bid);
if (result.status === 'accepted') {
  console.log('Bid won!', result.winning_price);
}
```

### Querying Cohorts

```typescript
const cohorts = await adMarketAPI.queryCohorts({
  cohorts: ['tech_enthusiasts', 'early_adopters'],
  min_audience_size: 100000
});

cohorts.forEach(cohort => {
  console.log(`${cohort.cohort}: ${cohort.estimated_size} users`);
  console.log(`  CTR: ${cohort.avg_ctr}%`);
  console.log(`  Floor price: ${cohort.floor_price} microBLOCK`);
});
```

### Verifying Receipts

```typescript
const receipts = await adMarketAPI.getImpressionReceipts('camp-001');

for (const receipt of receipts.receipts) {
  const verification = await adMarketAPI.verifyReceipt(receipt.receipt_id);
  if (verification.valid) {
    console.log(`Receipt ${receipt.receipt_id} verified at block ${verification.block_height}`);
  }
}
```

## WebSocket Real-Time Updates

```typescript
import { useAdMarket } from './hooks/useAdMarket';

function MyComponent() {
  const { campaigns, loading, error } = useAdMarket({
    autoRefresh: true,
    refreshInterval: 30000,
    enableWebSocket: true  // Real-time updates
  });

  return (
    <div>
      {campaigns.map(campaign => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}
```

## Data Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ WebSocket (real-time)
       │ HTTP/RPC (operations)
       │
       ▼
┌─────────────────┐
│  block-buster   │ (Frontend)
│   Web Server    │
└──────┬──────────┘
       │
       │ JSON-RPC 2.0
       │
       ▼
┌─────────────────┐
│   The Block     │ (L1 Blockchain)
│   ad_market     │
│   RPC Server    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Blockchain     │
│  State Machine  │
└─────────────────┘
```

## Performance Optimizations

1. **React.memo**: Memoized components prevent unnecessary re-renders
2. **useCallback**: Stable function references for event handlers
3. **Virtual scrolling**: Large campaign lists rendered efficiently
4. **Debounced search**: Reduces API calls during typing
5. **Local caching**: Recent data cached in React state
6. **WebSocket batching**: Updates sent in batches to reduce overhead

## Security

- **Auth tokens**: Bearer token authentication for RPC calls
- **Rate limiting**: IP-based limits prevent abuse
- **Input validation**: All user inputs sanitized
- **CORS**: Properly configured cross-origin policies
- **Content Security Policy**: XSS protection enabled

## Testing

```bash
# Run frontend tests
cd web
npm test

# Run E2E tests
npm run test:e2e

# Type checking
npm run type-check
```

## Deployment

### Environment Variables

```bash
# .env.production
VITE_API_URL=https://api.theblock.io
VITE_WS_URL=wss://ws.theblock.io
```

### Build

```bash
cd web
npm run build
# Outputs to web/dist
```

### Docker

```bash
docker build -t block-buster-web .
docker run -p 3000:3000 block-buster-web
```

## Roadmap

### Q1 2026 ✅
- [x] Core UI implementation
- [x] Campaign management
- [x] Analytics dashboard
- [x] RPC client integration
- [x] WebSocket support

### Q2 2026 🚧
- [ ] Real-time bidding interface
- [ ] Creative A/B testing
- [ ] Advanced fraud detection UI
- [ ] Mobile app

### Q3 2026 📋
- [ ] Publisher marketplace
- [ ] DeFi integration (yield on ad budgets)
- [ ] Cross-chain ad delivery
- [ ] Programmatic API

### Q4 2026 🔮
- [ ] AI-powered creative generation
- [ ] Predictive audience modeling
- [ ] Decentralized identity integration
- [ ] Zero-knowledge proof targeting

## Support

For issues or questions:
- GitHub: https://github.com/the-block/block-buster
- Discord: https://discord.gg/theblock
- Docs: https://docs.theblock.io/ad-marketplace

## License

MIT License - see LICENSE file for details
