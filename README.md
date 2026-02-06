# Dust 🌫️

Consolidate your crypto dust across chains to Base L2. No gas needed.

## Architecture

```
dust/
├── contracts/        # Solidity smart contracts (Hardhat)
│   ├── src/
│   │   ├── DustConsolidator.sol  # Main consolidation logic
│   │   ├── GasPaymaster.sol      # ERC-4337 paymaster
│   │   └── DustSender.sol        # Source chain sender (CCIP)
│   └── scripts/
│       └── deploy.js
├── backend/          # Node.js API
│   └── src/
│       ├── index.js
│       ├── routes/api.js
│       └── services/scanner.js
└── frontend/         # React + Vite + wagmi
    └── src/
        ├── App.jsx
        └── components/
```

## Quick Start

### 1. Smart Contracts

```bash
cd contracts
cp .env.example .env
# Edit .env with your private key and RPC URLs

npm install
npm run compile
npm run deploy:sepolia  # Deploy to Base Sepolia
```

### 2. Backend API

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys

npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## Required API Keys

| Key | Purpose | Get it at |
|-----|---------|-----------|
| Alchemy API Key | Multi-chain RPC | [alchemy.com](https://alchemy.com) |
| 0x API Key | Swap quotes | [0x.org](https://0x.org/docs) |
| Basescan API Key | Contract verification | [basescan.org](https://basescan.org) |

## Smart Contracts

### DustConsolidator.sol
- Receives assets from source chains via CCIP
- Executes swaps via 0x Protocol
- Handles fee deduction and settlement

### GasPaymaster.sol
- Sponsors gas for user transactions
- Tracks gas costs per job
- Recovers costs from consolidated amount

### DustSender.sol (deploy on source chains)
- Sends dust to Base via Chainlink CCIP
- Handles token approvals
- Manages LINK fees for bridging

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan` | Scan wallet for dust |
| POST | `/api/estimate` | Get consolidation fee estimate |
| POST | `/api/consolidate` | Start consolidation job |
| GET | `/api/status/:jobId` | Check job status |
| GET | `/api/prices` | Get current token prices |

## Revenue Model

- **Service fee**: 1% of consolidated amount
- **Gas recovery**: Deducted from final amount
- **Target**: 10K consolidations/month @ $20 avg = ~$2-3K MRR

## Deployment

### Testnet (Base Sepolia)
```bash
cd contracts
npm run deploy:sepolia
```

### Mainnet (Base)
```bash
cd contracts
npm run deploy:mainnet
```

## Security

- [ ] Audit DustConsolidator.sol
- [ ] Audit GasPaymaster.sol
- [ ] Rate limiting on API
- [ ] Slippage protection (max 3%)
- [ ] Min consolidation: $1
- [ ] Max dust value: $10

## License

MIT
