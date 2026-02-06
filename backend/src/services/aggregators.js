/**
 * Multi-Aggregator Swap Service
 * Supports: 0x, 1inch, Paraswap, Li.Fi
 * Automatically selects best price across all aggregators
 */

const AGGREGATOR_FEES = {
  '0x': 0.15,        // 0.15% affiliate fee
  '1inch': 0,        // Free, we can set our own affiliate fee
  'paraswap': 0,     // Free, partner fee optional
  'lifi': 0,         // Free, integrator fee optional
};

// Our service fee on top: 1.2% total - aggregator fee
const TOTAL_SERVICE_FEE = 1.2;

/**
 * Get quote from 0x Protocol
 */
async function get0xQuote(chainId, sellToken, buyToken, sellAmount, takerAddress) {
  try {
    const chainEndpoints = {
      1: 'https://api.0x.org',
      137: 'https://polygon.api.0x.org',
      42161: 'https://arbitrum.api.0x.org',
      10: 'https://optimism.api.0x.org',
      8453: 'https://base.api.0x.org',
      56: 'https://bsc.api.0x.org',
      43114: 'https://avalanche.api.0x.org',
    };

    const baseUrl = chainEndpoints[chainId];
    if (!baseUrl) return null;

    const params = new URLSearchParams({
      sellToken,
      buyToken,
      sellAmount: sellAmount.toString(),
      takerAddress: takerAddress || '0x0000000000000000000000000000000000000000',
    });

    const response = await fetch(`${baseUrl}/swap/v1/quote?${params}`, {
      headers: {
        '0x-api-key': process.env.ZERO_X_API_KEY || '',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      aggregator: '0x',
      buyAmount: BigInt(data.buyAmount),
      sellAmount: BigInt(data.sellAmount),
      gas: data.estimatedGas,
      data: data.data,
      to: data.to,
      value: data.value,
      fee: AGGREGATOR_FEES['0x'],
    };
  } catch (e) {
    console.error('0x quote error:', e.message);
    return null;
  }
}

/**
 * Get quote from 1inch
 */
async function get1inchQuote(chainId, sellToken, buyToken, sellAmount, takerAddress) {
  try {
    const response = await fetch(
      `https://api.1inch.dev/swap/v6.0/${chainId}/quote?` +
      `src=${sellToken}&dst=${buyToken}&amount=${sellAmount}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      aggregator: '1inch',
      buyAmount: BigInt(data.dstAmount),
      sellAmount: BigInt(sellAmount),
      gas: data.gas || 200000,
      fee: AGGREGATOR_FEES['1inch'],
      // For swap execution, we'd need to call /swap endpoint
      protocols: data.protocols,
    };
  } catch (e) {
    console.error('1inch quote error:', e.message);
    return null;
  }
}

/**
 * Get quote from Paraswap
 */
async function getParaswapQuote(chainId, sellToken, buyToken, sellAmount, takerAddress) {
  try {
    const response = await fetch(
      `https://apiv5.paraswap.io/prices?` +
      `srcToken=${sellToken}&destToken=${buyToken}&amount=${sellAmount}` +
      `&srcDecimals=18&destDecimals=18&side=SELL&network=${chainId}`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.priceRoute) return null;

    return {
      aggregator: 'paraswap',
      buyAmount: BigInt(data.priceRoute.destAmount),
      sellAmount: BigInt(data.priceRoute.srcAmount),
      gas: data.priceRoute.gasCost || 200000,
      fee: AGGREGATOR_FEES['paraswap'],
      priceRoute: data.priceRoute,
    };
  } catch (e) {
    console.error('Paraswap quote error:', e.message);
    return null;
  }
}

/**
 * Get quote from Li.Fi
 */
async function getLifiQuote(chainId, sellToken, buyToken, sellAmount, takerAddress) {
  try {
    const response = await fetch(
      `https://li.quest/v1/quote?` +
      `fromChain=${chainId}&toChain=${chainId}` +
      `&fromToken=${sellToken}&toToken=${buyToken}` +
      `&fromAmount=${sellAmount}` +
      `&fromAddress=${takerAddress || '0x0000000000000000000000000000000000000000'}`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.estimate) return null;

    return {
      aggregator: 'lifi',
      buyAmount: BigInt(data.estimate.toAmount),
      sellAmount: BigInt(data.estimate.fromAmount),
      gas: data.estimate.gasCosts?.[0]?.estimate || 200000,
      fee: AGGREGATOR_FEES['lifi'],
      toolDetails: data.toolDetails,
      transactionRequest: data.transactionRequest,
    };
  } catch (e) {
    console.error('Li.Fi quote error:', e.message);
    return null;
  }
}

/**
 * Get best quote across all aggregators
 */
export async function getBestQuote(chainId, sellToken, buyToken, sellAmount, takerAddress) {
  console.log(`Getting quotes for ${sellAmount} ${sellToken} -> ${buyToken} on chain ${chainId}`);

  // Query all aggregators in parallel
  const [quote0x, quote1inch, quoteParaswap, quoteLifi] = await Promise.all([
    get0xQuote(chainId, sellToken, buyToken, sellAmount, takerAddress),
    get1inchQuote(chainId, sellToken, buyToken, sellAmount, takerAddress),
    getParaswapQuote(chainId, sellToken, buyToken, sellAmount, takerAddress),
    getLifiQuote(chainId, sellToken, buyToken, sellAmount, takerAddress),
  ]);

  const quotes = [quote0x, quote1inch, quoteParaswap, quoteLifi].filter(q => q !== null);

  if (quotes.length === 0) {
    console.log('No quotes available from any aggregator');
    return null;
  }

  // Calculate net output for each (accounting for aggregator fees)
  const quotesWithNet = quotes.map(q => {
    const aggregatorFeeAmount = (q.buyAmount * BigInt(Math.floor(q.fee * 100))) / 10000n;
    const netOutput = q.buyAmount - aggregatorFeeAmount;
    return { ...q, netOutput };
  });

  // Sort by net output (highest first)
  quotesWithNet.sort((a, b) => {
    if (a.netOutput > b.netOutput) return -1;
    if (a.netOutput < b.netOutput) return 1;
    return 0;
  });

  const best = quotesWithNet[0];
  console.log(`Best quote from ${best.aggregator}: ${best.buyAmount.toString()} (net: ${best.netOutput.toString()})`);
  console.log(`All quotes:`, quotesWithNet.map(q => `${q.aggregator}: ${q.buyAmount.toString()}`));

  return {
    ...best,
    allQuotes: quotesWithNet.map(q => ({
      aggregator: q.aggregator,
      buyAmount: q.buyAmount.toString(),
      netOutput: q.netOutput.toString(),
      fee: q.fee,
    })),
    ourServiceFee: TOTAL_SERVICE_FEE - best.fee, // Our cut after aggregator fee
  };
}

/**
 * Get swap calldata for execution
 */
export async function getSwapCalldata(chainId, sellToken, buyToken, sellAmount, takerAddress, preferredAggregator = null) {
  // If preferred aggregator specified, try that first
  if (preferredAggregator === '0x') {
    const quote = await get0xQuote(chainId, sellToken, buyToken, sellAmount, takerAddress);
    if (quote && quote.data) return quote;
  }

  // Otherwise get best quote and build calldata
  const best = await getBestQuote(chainId, sellToken, buyToken, sellAmount, takerAddress);
  if (!best) return null;

  // For 0x, we already have calldata
  if (best.aggregator === '0x' && best.data) {
    return best;
  }

  // For 1inch, fetch swap data
  if (best.aggregator === '1inch') {
    try {
      const response = await fetch(
        `https://api.1inch.dev/swap/v6.0/${chainId}/swap?` +
        `src=${sellToken}&dst=${buyToken}&amount=${sellAmount}` +
        `&from=${takerAddress}&slippage=1`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
            'Accept': 'application/json',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        return {
          ...best,
          data: data.tx.data,
          to: data.tx.to,
          value: data.tx.value,
        };
      }
    } catch (e) {
      console.error('1inch swap error:', e.message);
    }
  }

  // For Paraswap, build transaction
  if (best.aggregator === 'paraswap' && best.priceRoute) {
    try {
      const response = await fetch('https://apiv5.paraswap.io/transactions/' + chainId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcToken: sellToken,
          destToken: buyToken,
          srcAmount: sellAmount.toString(),
          destAmount: best.buyAmount.toString(),
          priceRoute: best.priceRoute,
          userAddress: takerAddress,
          partner: 'dust',
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return {
          ...best,
          data: data.data,
          to: data.to,
          value: data.value,
        };
      }
    } catch (e) {
      console.error('Paraswap tx error:', e.message);
    }
  }

  // For Li.Fi, use transactionRequest
  if (best.aggregator === 'lifi' && best.transactionRequest) {
    return {
      ...best,
      data: best.transactionRequest.data,
      to: best.transactionRequest.to,
      value: best.transactionRequest.value,
    };
  }

  // Fallback to 0x if others fail
  return get0xQuote(chainId, sellToken, buyToken, sellAmount, takerAddress);
}

/**
 * Check if a token is supported by any aggregator
 */
export async function isTokenSupported(chainId, tokenAddress) {
  // Try to get a small quote to USDC to check support
  const testAmount = '1000000000000000000'; // 1 token
  const usdcAddresses = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  };

  const usdc = usdcAddresses[chainId];
  if (!usdc) return false;

  const quote = await getBestQuote(chainId, tokenAddress, usdc, testAmount, null);
  return quote !== null;
}

export default {
  getBestQuote,
  getSwapCalldata,
  isTokenSupported,
  AGGREGATOR_FEES,
  TOTAL_SERVICE_FEE,
};
