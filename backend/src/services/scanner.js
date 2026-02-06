import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import axios from 'axios';
import { CHAINS, TOKENS, COINGECKO_IDS, DUST_CONFIG, getRpc } from '../config/chains.js';

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

// Price cache (5 minute TTL)
const priceCache = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get token price from CoinGecko
 */
export async function getTokenPrice(symbol) {
  const cacheKey = symbol.toUpperCase();
  const cached = priceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const geckoId = COINGECKO_IDS[cacheKey];
    if (!geckoId) return 0;

    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price`,
      {
        params: {
          ids: geckoId,
          vs_currencies: 'usd',
        },
        headers: process.env.COINGECKO_API_KEY 
          ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
          : {},
      }
    );

    const price = response.data[geckoId]?.usd || 0;
    priceCache.set(cacheKey, { price, timestamp: Date.now() });
    return price;
  } catch (error) {
    console.error(`Price fetch error for ${symbol}:`, error.message);
    return cached?.price || 0;
  }
}

/**
 * Create viem client for a chain
 */
function getClient(chainId) {
  const chainConfig = CHAINS.find(c => c.id === chainId);
  if (!chainConfig) throw new Error(`Unsupported chain: ${chainId}`);
  
  return createPublicClient({
    chain: chainConfig.chain,
    transport: http(getRpc(chainId)),
  });
}

/**
 * Get native token balance
 */
async function getNativeBalance(chainId, address) {
  const client = getClient(chainId);
  const chainConfig = CHAINS.find(c => c.id === chainId);
  
  try {
    const balance = await client.getBalance({ address });
    const balanceNum = Number(formatUnits(balance, 18));
    const price = await getTokenPrice(chainConfig.nativeSymbol);
    const usdValue = balanceNum * price;

    if (usdValue >= DUST_CONFIG.minValueUSD && usdValue <= DUST_CONFIG.maxValueUSD) {
      return {
        symbol: chainConfig.nativeSymbol,
        balance: balanceNum,
        usdValue,
        address: 'native',
        decimals: 18,
      };
    }
  } catch (error) {
    console.error(`Native balance error on ${chainConfig.name}:`, error.message);
  }
  
  return null;
}

/**
 * Get ERC20 token balance
 */
async function getTokenBalance(chainId, tokenAddress, userAddress, symbol) {
  const client = getClient(chainId);
  
  try {
    const [balance, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }),
      client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    const balanceNum = Number(formatUnits(balance, decimals));
    if (balanceNum === 0) return null;

    const price = await getTokenPrice(symbol);
    const usdValue = balanceNum * price;

    if (usdValue >= DUST_CONFIG.minValueUSD && usdValue <= DUST_CONFIG.maxValueUSD) {
      return {
        symbol,
        balance: balanceNum,
        usdValue,
        address: tokenAddress,
        decimals,
      };
    }
  } catch (error) {
    // Token might not exist on this chain
  }
  
  return null;
}

/**
 * Estimate gas cost for chain
 */
async function getGasCostUSD(chainId) {
  const client = getClient(chainId);
  const chainConfig = CHAINS.find(c => c.id === chainId);
  
  try {
    const gasPrice = await client.getGasPrice();
    const ethPrice = await getTokenPrice(chainConfig.nativeSymbol);
    
    // Estimate 65,000 gas for ERC20 transfer
    const gasCostNative = Number(formatUnits(gasPrice * 65000n, 18));
    return gasCostNative * ethPrice * chainConfig.gasMultiplier;
  } catch (error) {
    console.error(`Gas price error on ${chainConfig.name}:`, error.message);
    return 0.50; // Default fallback
  }
}

/**
 * Scan a single chain for dust
 */
async function scanChain(chainId, userAddress) {
  const chainConfig = CHAINS.find(c => c.id === chainId);
  if (!chainConfig || chainConfig.isDestination) return null;

  const tokens = [];
  const gasCost = await getGasCostUSD(chainId);

  // Check native balance
  const nativeBalance = await getNativeBalance(chainId, userAddress);
  if (nativeBalance && nativeBalance.usdValue > gasCost) {
    tokens.push(nativeBalance);
  }

  // Check common tokens
  for (const [symbol, addresses] of Object.entries(TOKENS)) {
    const tokenAddress = addresses[chainId];
    if (!tokenAddress) continue;

    const tokenBalance = await getTokenBalance(chainId, tokenAddress, userAddress, symbol);
    if (tokenBalance && tokenBalance.usdValue > gasCost) {
      tokens.push(tokenBalance);
    }
  }

  const totalUSD = tokens.reduce((sum, t) => sum + t.usdValue, 0);

  return {
    chainId,
    name: chainConfig.name,
    tokens,
    totalUSD,
    estimatedGas: gasCost,
    ccipChainSelector: chainConfig.ccipChainSelector,
  };
}

/**
 * Scan all chains for a user's dust
 */
export async function scanAllChains(userAddress) {
  const sourceChains = CHAINS.filter(c => !c.isDestination);
  
  const results = await Promise.allSettled(
    sourceChains.map(chain => scanChain(chain.id, userAddress))
  );

  const chains = results
    .filter(r => r.status === 'fulfilled' && r.value?.totalUSD > 0)
    .map(r => r.value);

  const totalRecoverable = chains.reduce((sum, c) => sum + c.totalUSD, 0);
  const totalGasEstimate = chains.reduce((sum, c) => sum + c.estimatedGas, 0);

  return {
    address: userAddress,
    chains,
    totalRecoverable: Number(totalRecoverable.toFixed(2)),
    totalGasEstimate: Number(totalGasEstimate.toFixed(2)),
    chainCount: chains.length,
    tokenCount: chains.reduce((sum, c) => sum + c.tokens.length, 0),
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Estimate consolidation fees
 */
export async function estimateFees(scanResult, targetAsset = 'USDC') {
  const { totalRecoverable, totalGasEstimate, chainCount } = scanResult;
  
  // Bridge fees (approx 0.1% per bridge + CCIP fees)
  const bridgeFees = totalRecoverable * 0.001 * chainCount + (chainCount * 0.50);
  
  // Service fee (1.2% - covers 0x swap fee + profit)
  const serviceFee = totalRecoverable * 0.012;
  
  // Swap fees (0.3% Uniswap fee)
  const swapFees = totalRecoverable * 0.003;
  
  const totalFees = totalGasEstimate + bridgeFees + serviceFee + swapFees;
  const netAmount = Math.max(0, totalRecoverable - totalFees);

  return {
    targetAsset,
    grossAmount: totalRecoverable,
    fees: {
      gas: Number(totalGasEstimate.toFixed(2)),
      bridge: Number(bridgeFees.toFixed(2)),
      service: Number(serviceFee.toFixed(2)),
      swap: Number(swapFees.toFixed(2)),
      total: Number(totalFees.toFixed(2)),
    },
    netAmount: Number(netAmount.toFixed(2)),
    worthIt: netAmount >= DUST_CONFIG.minProfitableUSD,
    profitMargin: totalRecoverable > 0 
      ? Number(((netAmount / totalRecoverable) * 100).toFixed(1))
      : 0,
  };
}
