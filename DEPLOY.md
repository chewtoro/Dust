# Dust Deployment Guide

## Quick Deploy (15 minutes total)

### Step 1: Deploy Backend to Railway

1. Go to [railway.app](https://railway.app) and sign up/login with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub and select the `dust` repo
4. Set root directory to `backend`
5. Add environment variables:
   ```
   PORT=3000
   NODE_ENV=production
   DUST_CONSOLIDATOR_ADDRESS=0xaAa64c47e45D845FB756eB386561c883F61F8777
   ZERO_X_API_KEY=your_0x_key
   BACKEND_PRIVATE_KEY=your_private_key
   ```
6. Deploy! You'll get a URL like `dust-backend.up.railway.app`

### Step 2: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login with GitHub
2. Click "Import Project" → select your `dust` repo
3. Set root directory to `frontend`
4. Add environment variable:
   ```
   VITE_API_URL=https://dust-backend.up.railway.app
   ```
5. Deploy! You'll get a URL like `dust-app.vercel.app`

### Step 3: Submit to Base Mini App Store

1. Go to [base.org/builders](https://base.org/builders)
2. Create account / login
3. Navigate to "Mini Apps" → "Submit New App"
4. Fill in:
   - **Name**: Dust
   - **Description**: Consolidate your crypto dust across chains to Base
   - **URL**: Your Vercel URL
   - **Category**: DeFi / Utilities
5. Upload icon (512x512)
6. Submit for review (usually 2-3 days)

---

## Contract Addresses

### Base Sepolia (Testnet)
- DustConsolidatorMVP: `0xaAa64c47e45D845FB756eB386561c883F61F8777`

### Base Mainnet (Production)
- Deploy when ready: `npm run deploy:mainnet`

---

## Environment Variables Reference

### Backend
| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | Yes |
| NODE_ENV | Environment | Yes |
| DUST_CONSOLIDATOR_ADDRESS | Contract address | Yes |
| ZERO_X_API_KEY | 0x Protocol API key | Yes |
| BACKEND_PRIVATE_KEY | Wallet for signing | Yes |

### Frontend
| Variable | Description | Required |
|----------|-------------|----------|
| VITE_API_URL | Backend API URL | Yes |

---

## Testing Checklist

- [ ] Backend health check responds
- [ ] Wallet scan returns results
- [ ] Fee estimation works
- [ ] Wallet connection works
- [ ] UI renders correctly on mobile
- [ ] Base wallet integration works

---

## Mainnet Deployment

When ready for production:

1. Deploy contracts to Base mainnet:
   ```bash
   cd contracts
   npm run deploy:mainnet
   ```

2. Update backend environment with mainnet contract address

3. Fund the contract with ETH for gas sponsoring

4. Update frontend to use mainnet

5. Re-submit to Base Mini App Store with production URL
