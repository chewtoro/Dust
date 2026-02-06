import { Router } from 'express';
import { z } from 'zod';
import { scanAllChains, estimateFees } from '../services/scanner.js';

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
