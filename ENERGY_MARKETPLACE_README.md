# Energy Marketplace - The Block's Decentralized Energy Trading Platform

## Overview

The Energy Marketplace is a peer-to-peer renewable energy trading platform built on The Block L1 blockchain. It enables prosumers (producer-consumers) to sell excess renewable energy directly to buyers, creating a decentralized energy grid with transparent, verified transactions.

## Why It's Revolutionary

### **Problem with Traditional Energy Markets**
1. **Centralized Control**: Utilities monopolize distribution
2. **Opaque Pricing**: Hidden fees and markups
3. **No Consumer Choice**: Can't choose renewable sources
4. **Slow Settlement**: Monthly billing cycles
5. **Trust Required**: Meter readings can be manipulated
6. **Stranded Assets**: Excess solar/wind energy wasted

### **The Block's Solution**
1. **Peer-to-Peer Trading**: Direct producer-to-consumer transactions
2. **On-Chain Transparency**: All trades verified on blockchain
3. **IoT Verification**: Smart meters cryptographically sign readings
4. **Instant Settlement**: Real-time payment for energy delivered
5. **Zero Waste**: Every kWh finds a buyer
6. **Carbon Tracking**: Built-in CO₂ offset accounting

## Architecture

```
┌──────────────────────────────────────────────┐
│                                              │
│         IoT Smart Meters (Prosumers)         │
│  Solar Panels | Wind Turbines | Batteries    │
│                                              │
└─────────────────────┬──────────────────────┘
                       │
                       │ Cryptographically signed
                       │ meter readings
                       │
       ┌───────────────┫──────────────┐
       │                              │
       ▼                              ▼
┌───────────────┐          ┌───────────────────┐
│               │          │                   │
│  Energy        │          │  Energy Market   │
│  Marketplace   │──────────┤  Frontend (UI)   │
│  (This App)    │   RPC    │                   │
│               │          │  - Provider Reg  │
└───────┬────────┘          │  - Meter Submit  │
        │                     │  - Trading       │
        │                     │  - Analytics     │
        │                     │                   │
        │                     └────────┬──────────┘
        │                              │
        │ JSON-RPC                     │
        │                              │
        ▼                              ▼
┌──────────────────────────────────────────────┐
│                                              │
│      The Block L1 - energy.* RPC Namespace  │
│                                              │
│  - Provider Registration                   │
│  - Meter Reading Validation                │
│  - Energy Credit Minting                   │
│  - Trading & Settlement                    │
│  - Dispute Resolution                      │
│  - Fraud Detection (ML)                    │
│                                              │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
       ┌──────────────────────────────┐
       │                              │
       │   Blockchain State Machine   │
       │                              │
       │  - Provider Registry         │
       │  - Energy Credits            │
       │  - Settlement Receipts       │
       │  - Dispute Log               │
       │                              │
       └──────────────────────────────┘
```

## Features

### 1. **Overview Dashboard**
- **Market Metrics**:
  - Total capacity (MWh)
  - Average price ($/kWh)
  - Energy traded (GWh)
  - Carbon offset (tons CO₂)
  - Active providers & buyers
  - Grid health score

- **Price Chart**: 24-hour energy pricing trends
- **Energy Mix**: Distribution of solar, wind, hydro, battery, etc.
- **Top Providers**: Leaderboard by energy sold

### 2. **Provider Management**
- **Registration**: 3-step wizard
  - Step 1: Energy source details (type, capacity)
  - Step 2: Location & meter configuration
  - Step 3: Pricing & stake economics
- **Provider Cards**: Visual grid of all energy sources
- **Filtering**: By energy type, location, price
- **Provider Details**: Capacity, availability, price, rating, uptime

### 3. **Energy Trading** (Coming Soon)
- Instant energy credit purchases
- Smart contract escrow
- Automated settlement
- Dynamic pricing engine

### 4. **My Energy Portfolio** (Coming Soon)
- Provider dashboard (if registered)
- Purchase history
- Energy credit balance
- Earnings and savings
- Carbon offset achievements

### 5. **Dispute Resolution**
- Open disputes list
- Investigation tracking
- Resolution workflow
- Slash receipts (penalties)

### 6. **Analytics**
- Trading volume charts
- Revenue tracking
- Environmental impact metrics
- Carbon equivalent calculations

## How It Works

### **For Energy Producers (Prosumers)**

#### 1. Register as Provider
```typescript
import { energyMarketAPI } from './api/energyMarket';

const result = await energyMarketAPI.registerProvider({
  capacity_kwh: 15000,                // 15 MWh capacity
  price_per_kwh: 0.08,                // $0.08 per kWh
  meter_address: 'solar_meter_001',   // IoT device ID
  jurisdiction: 'US_CA',              // California
  stake: 10000 * 1e6,                 // 10,000 BLOCK stake
  owner: 'alice.theblock',
  energy_type: 'solar',
});

console.log('Provider ID:', result.provider_id);
```

#### 2. Submit Meter Readings
```typescript
const reading = await energyMarketAPI.submitReading({
  provider_id: 'energy-0x001',
  meter_address: 'solar_meter_001',
  kwh_reading: 1500,                  // 1,500 kWh generated
  timestamp: Date.now() / 1000,
  signature: '0xabc123...',           // Crypto signature from meter
});

console.log('Credit ID:', reading.credit_id);
console.log('Amount:', reading.amount_kwh, 'kWh');
```

#### 3. Earn Revenue
- Credits automatically listed on marketplace
- Buyers purchase at your set price
- Instant settlement via blockchain
- Revenue paid in BLOCK tokens

### **For Energy Consumers (Buyers)**

#### 1. Browse Providers
```typescript
const providers = await energyMarketAPI.listProviders({
  energy_type: 'solar',
  jurisdiction: 'US_CA',
  max_price: 0.10,
  min_capacity: 1000,
});

providers.forEach(p => {
  console.log(`${p.owner}: ${p.available_kwh} kWh @ $${p.price_per_kwh}/kWh`);
});
```

#### 2. Purchase Energy
```typescript
const purchase = await energyMarketAPI.purchaseEnergy({
  provider_id: 'energy-0x001',
  kwh_amount: 500,
  max_price_per_kwh: 0.09,
});

console.log('Transaction ID:', purchase.transaction_id);
console.log('Total Cost:', purchase.total_cost, 'BLOCK');
```

#### 3. Track Carbon Offset
```typescript
const carbon = await energyMarketAPI.getCarbonOffset();

console.log('CO₂ Offset:', carbon.total_kg_co2 / 1000, 'tons');
console.log('Equivalent Trees:', carbon.equivalent_trees);
```

## Security & Verification

### **Cryptographic Meter Signing**
All IoT meters must sign readings with their private key:

1. **Meter Registration**: Public key registered on-chain during provider signup
2. **Reading Signature**: Each reading signed with private key from secure element (HSM/TPM)
3. **On-Chain Validation**: The Block verifies signature before minting credits
4. **Quorum Check**: Validators cross-reference readings for consistency

```
Meter Reading Process:

1. IoT Meter measures energy output
2. Device signs reading with private key
3. Reading + signature sent to blockchain
4. Validators verify:
   - Signature matches registered public key
   - Reading is monotonically increasing
   - Timestamp is recent
   - No duplicate readings
5. If valid, energy credits minted
6. If invalid, dispute flagged
```

### **Stake & Slashing**
Providers must stake BLOCK tokens as collateral:

- **Minimum Stake**: 1,000 BLOCK
- **Slashing Conditions**:
  - False meter readings (quorum failure)
  - Dispute resolution against provider
  - Expired credits not delivered
  - Signature verification failures

- **Slash Amounts**: 10-50% of stake depending on severity
- **Recovery**: Providers can re-stake after resolution

### **Dispute Resolution**
Any participant can flag suspicious readings:

1. **Open Dispute**: Submit meter hash + reason
2. **Investigation**: Validators review evidence
3. **Quorum Vote**: Decentralized resolution
4. **Outcome**:
   - Provider cleared: Stake intact
   - Provider guilty: Stake slashed, credits revoked

## API Reference

### Provider Operations
```typescript
// Register provider
await energyMarketAPI.registerProvider(registration);

// Update provider settings
await energyMarketAPI.updateProvider(providerId, updates);

// Get provider info
const provider = await energyMarketAPI.getProvider(providerId);

// List all providers
const providers = await energyMarketAPI.listProviders(filters);
```

### Meter Readings
```typescript
// Submit reading
await energyMarketAPI.submitReading(reading);

// Get credits
const { credits } = await energyMarketAPI.getCredits(providerId);
```

### Trading
```typescript
// Purchase energy
await energyMarketAPI.purchaseEnergy(request);

// Get available offers
const offers = await energyMarketAPI.getOffers(filters);
```

### Settlement
```typescript
// Settle transaction
await energyMarketAPI.settle(request);

// Get receipts
const { receipts } = await energyMarketAPI.getReceipts(providerId);
```

### Disputes
```typescript
// Flag dispute
await energyMarketAPI.flagDispute(request);

// Resolve dispute
await energyMarketAPI.resolveDispute(resolution);

// Get disputes
const { disputes } = await energyMarketAPI.getDisputes(filters);
```

### Analytics
```typescript
// Market stats
const stats = await energyMarketAPI.getMarketStats();

// Price history
const history = await energyMarketAPI.getPriceHistory();

// Carbon offset
const carbon = await energyMarketAPI.getCarbonOffset(providerId);
```

## Real-Time Updates

### WebSocket Integration
```typescript
import { useEnergyMarket } from './hooks/useEnergyMarket';

function MyComponent() {
  const { providers, marketStats, loading } = useEnergyMarket({
    autoRefresh: true,
    refreshInterval: 10000,
    enableWebSocket: true,
  });

  // Real-time updates automatically reflected
  return <div>{/* Render data */}</div>;
}
```

### WebSocket Events
- `provider_update`: Provider settings changed
- `new_reading`: Meter reading submitted
- `new_settlement`: Energy transaction completed
- `dispute_opened`: New dispute flagged
- `dispute_resolved`: Dispute outcome

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
npm install
npm run build
```

### Docker
```bash
docker build -t block-buster-energy .
docker run -p 3000:3000 block-buster-energy
```

## Use Cases

### 1. **Residential Solar**
Homeowners with solar panels sell excess energy:
- Install smart meter
- Register as provider
- Automatic credit generation
- Passive income from sunshine

### 2. **Community Microgrids**
Neighborhoods create local energy networks:
- Multiple prosumers pool capacity
- Local buyers get cheaper rates
- Reduced transmission loss
- Enhanced grid resilience

### 3. **Industrial Storage**
Battery operators arbitrage energy:
- Buy cheap (off-peak)
- Store energy
- Sell expensive (peak demand)
- Stabilize grid

### 4. **Renewable Certificates**
Businesses offset carbon footprints:
- Purchase verified renewable energy
- On-chain proof of green power usage
- Transparent ESG reporting
- Regulatory compliance

## Roadmap

### Q1 2026 ✅
- [x] Core UI implementation
- [x] Provider registration
- [x] Meter reading submission
- [x] Analytics dashboard
- [x] RPC client integration

### Q2 2026 🚧
- [ ] Real-time trading interface
- [ ] Smart contract escrow
- [ ] Mobile IoT app
- [ ] Advanced fraud detection

### Q3 2026 📋
- [ ] Dynamic pricing algorithms
- [ ] Grid balancing incentives
- [ ] Cross-border energy trading
- [ ] Integration with traditional grids

### Q4 2026 🔮
- [ ] AI-powered demand forecasting
- [ ] Automated battery arbitrage
- [ ] Peer-to-peer energy contracts
- [ ] Decentralized autonomous grid (DAG)

## Environmental Impact

### **Carbon Offset Tracking**
Every kWh of renewable energy = CO₂ saved:

- **Solar**: 0.4 kg CO₂ per kWh
- **Wind**: 0.4 kg CO₂ per kWh
- **Hydro**: 0.02 kg CO₂ per kWh

The marketplace automatically calculates total environmental impact.

### **Transparency**
Unlike traditional carbon credits:
- **On-chain verification**: Immutable proof
- **Real-time tracking**: Instant updates
- **No double-counting**: Blockchain prevents fraud
- **Direct attribution**: Every credit traceable to source

## Support

- **Docs**: https://docs.theblock.io/energy-marketplace
- **Discord**: https://discord.gg/theblock
- **GitHub**: https://github.com/the-block/block-buster

## License

MIT License - see LICENSE file
