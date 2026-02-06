import { mainnet, polygon, arbitrum, optimism, bsc, avalanche, base } from 'viem/chains';

// Using free public RPCs for reliability
export const CHAINS = [
  {
    id: 1,
    name: 'Ethereum',
    chain: mainnet,
    rpc: 'https://eth.llamarpc.com',
    ccipChainSelector: '5009297550715157269',
    nativeSymbol: 'ETH',
    gasMultiplier: 1.2,
  },
  {
    id: 137,
    name: 'Polygon',
    chain: polygon,
    rpc: 'https://polygon.llamarpc.com',
    ccipChainSelector: '4051577828743386545',
    nativeSymbol: 'MATIC',
    gasMultiplier: 1.1,
  },
  {
    id: 42161,
    name: 'Arbitrum',
    chain: arbitrum,
    rpc: 'https://arbitrum.llamarpc.com',
    ccipChainSelector: '4949039107694359620',
    nativeSymbol: 'ETH',
    gasMultiplier: 1.1,
  },
  {
    id: 10,
    name: 'Optimism',
    chain: optimism,
    rpc: 'https://optimism.llamarpc.com',
    ccipChainSelector: '3734403246176062136',
    nativeSymbol: 'ETH',
    gasMultiplier: 1.1,
  },
  {
    id: 56,
    name: 'BSC',
    chain: bsc,
    rpc: 'https://bsc-dataseed.binance.org/',
    ccipChainSelector: '11344663589394136015',
    nativeSymbol: 'BNB',
    gasMultiplier: 1.0,
  },
  {
    id: 43114,
    name: 'Avalanche',
    chain: avalanche,
    rpc: 'https://api.avax.network/ext/bc/C/rpc',
    ccipChainSelector: '6433500567565415381',
    nativeSymbol: 'AVAX',
    gasMultiplier: 1.1,
  },
  {
    id: 8453,
    name: 'Base',
    chain: base,
    rpc: 'https://mainnet.base.org',
    ccipChainSelector: '15971525489660198786',
    nativeSymbol: 'ETH',
    gasMultiplier: 1.0,
    isDestination: true,
  },
];

// Token addresses per chain
export const TOKENS = {
  USDC: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC
    56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  USDT: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    56: '0x55d398326f99059fF775485246999027B3197955',
    43114: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  },
  WETH: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    10: '0x4200000000000000000000000000000000000006',
    8453: '0x4200000000000000000000000000000000000006',
  },
  DAI: {
    1: '0x6B175474E89094C44Da98b954EescdeCB5f',
    137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
};

// CoinGecko token ID mapping
export const COINGECKO_IDS = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  MATIC: 'matic-network',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
};

// Dust thresholds
export const DUST_CONFIG = {
  minValueUSD: 0.10,  // Minimum $0.10 to be considered
  maxValueUSD: 10.0,  // Maximum $10 to be considered dust
  minProfitableUSD: 1.0, // Minimum for profitable consolidation
};

export function getChainById(chainId) {
  return CHAINS.find(c => c.id === chainId);
}

export function getRpc(chainId) {
  const chain = getChainById(chainId);
  if (!chain) return null;
  return chain.rpc;
}
