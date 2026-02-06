import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, metaMask } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base, baseSepolia],
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
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
