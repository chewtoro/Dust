import { Router } from 'express';
import { z } from 'zod';
import { scanAllChains, estimateFees } from '../services/scanner.js';
import { getBestQuote, getSwapCalldata, isTokenSupported, AGGREGATOR_FEES, TOTAL_SERVICE_FEE } from '../services/aggregators.js';

const router = Router();

// Validation schemas
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const targetAssetSchema = z.enum(['USDC', 'ETH']);

/**
 * POST /api/scan
 * Scan user's wallet across all chains for dust
 */
router.post('/scan', async (req, res) => {
  try {
    const { address } = req.body;
    
    const validatedAddress = addressSchema.parse(address);
    const result = await scanAllChains(validatedAddress);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
      });
    }
    
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: 'Scan failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/estimate
 * Estimate fees for consolidation
 */
router.post('/estimate', async (req, res) => {
  try {
    const { address, targetAsset = 'USDC' } = req.body;
    
    const validatedAddress = addressSchema.parse(address);
    const validatedAsset = targetAssetSchema.parse(targetAsset);
    
    // First scan
    const scanResult = await scanAllChains(validatedAddress);
    
    // Then estimate
    const estimate = await estimateFees(scanResult, validatedAsset);
    
    res.json({
      success: true,
      data: {
        scan: scanResult,
        estimate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
        details: error.errors,
      });
    }
    
    console.error('Estimate error:', error);
    res.status(500).json({
      success: false,
      error: 'Estimation failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/consolidate
 * Initiate consolidation job
 */
router.post('/consolidate', async (req, res) => {
  try {
    const { address, targetAsset = 'USDC' } = req.body;
    
    const validatedAddress = addressSchema.parse(address);
    const validatedAsset = targetAssetSchema.parse(targetAsset);
    
    // Generate job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // TODO: Implement actual consolidation logic
    // 1. Scan chains for dust
    // 2. Create job in DustConsolidator contract
    // 3. Sponsor gas via GasPaymaster
    // 4. Initiate CCIP transfers from each source chain
    // 5. Queue job monitoring
    
    res.json({
      success: true,
      data: {
        jobId,
        status: 'pending',
        targetAsset: validatedAsset,
        message: 'Consolidation job created',
        estimatedTime: '5-10 minutes',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters',
      });
    }
    
    console.error('Consolidate error:', error);
    res.status(500).json({
      success: false,
      error: 'Consolidation failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/status/:jobId
 * Check consolidation job status
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // TODO: Query actual job status from contract/database
    // For now, return mock status
    
    res.json({
      success: true,
      data: {
        jobId,
        status: 'processing',
        steps: [
          { step: 'Gas fronting', status: 'complete' },
          { step: 'Bridging assets', status: 'processing' },
          { step: 'Swapping tokens', status: 'pending' },
          { step: 'Settlement', status: 'pending' },
        ],
        progress: 40,
        estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Status check failed',
    });
  }
});

/**
 * POST /api/quote
 * Get best swap quote across all aggregators
 */
router.post('/quote', async (req, res) => {
  try {
    const { chainId, sellToken, buyToken, sellAmount, takerAddress } = req.body;

    if (!chainId || !sellToken || !buyToken || !sellAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: chainId, sellToken, buyToken, sellAmount',
      });
    }

    const quote = await getBestQuote(
      parseInt(chainId),
      sellToken,
      buyToken,
      sellAmount,
      takerAddress
    );

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'No quotes available for this token pair',
        suggestion: 'Token may not have sufficient liquidity on any aggregator',
      });
    }

    res.json({
      success: true,
      data: {
        bestAggregator: quote.aggregator,
        buyAmount: quote.buyAmount.toString(),
        netOutput: quote.netOutput.toString(),
        aggregatorFee: quote.fee,
        ourServiceFee: quote.ourServiceFee,
        totalFee: TOTAL_SERVICE_FEE,
        allQuotes: quote.allQuotes,
      },
    });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quote',
      message: error.message,
    });
  }
});

/**
 * POST /api/check-token
 * Check if a token is swappable via any aggregator
 */
router.post('/check-token', async (req, res) => {
  try {
    const { chainId, tokenAddress } = req.body;

    if (!chainId || !tokenAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: chainId, tokenAddress',
      });
    }

    const supported = await isTokenSupported(parseInt(chainId), tokenAddress);

    res.json({
      success: true,
      data: {
        chainId,
        tokenAddress,
        supported,
        aggregators: supported ? Object.keys(AGGREGATOR_FEES) : [],
      },
    });
  } catch (error) {
    console.error('Check token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check token',
      message: error.message,
    });
  }
});

/**
 * GET /api/aggregators
 * List supported aggregators and their fees
 */
router.get('/aggregators', (req, res) => {
  res.json({
    success: true,
    data: {
      aggregators: [
        { name: '0x', fee: 0.15, description: 'DEX aggregator with wide coverage' },
        { name: '1inch', fee: 0, description: 'Leading DEX aggregator' },
        { name: 'paraswap', fee: 0, description: 'Multi-chain aggregator' },
        { name: 'lifi', fee: 0, description: 'Cross-chain aggregator' },
      ],
      totalServiceFee: TOTAL_SERVICE_FEE,
      feeBreakdown: {
        aggregatorFee: 'Varies (0-0.15%)',
        dustServiceFee: '1.05-1.2%',
        total: '1.2%',
      },
    },
  });
});

/**
 * GET /api/prices
 * Get current token prices
 */
router.get('/prices', async (req, res) => {
  try {
    const { getTokenPrice } = await import('../services/scanner.js');
    
    const [eth, usdc, matic, bnb, avax] = await Promise.all([
      getTokenPrice('ETH'),
      getTokenPrice('USDC'),
      getTokenPrice('MATIC'),
      getTokenPrice('BNB'),
      getTokenPrice('AVAX'),
    ]);
    
    res.json({
      success: true,
      data: {
        ETH: eth,
        USDC: usdc,
        MATIC: matic,
        BNB: bnb,
        AVAX: avax,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Prices error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prices',
    });
  }
});

export default router;
