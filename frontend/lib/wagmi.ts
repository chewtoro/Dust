import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, metaMask } from 'wagmi/connectors';

// Base Mainnet only for production
export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Dust',
      preference: 'smartWalletOnly',
    }),
    metaMask({
      dappMetadata: {
        name: 'Dust',
        url: 'https://dust.app',
      },
    }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
