import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));
app.use(morgan('combined'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║         Dust Backend API              ║
║═══════════════════════════════════════║
║  Port: ${PORT.toString().padEnd(30)}║
║  Mode: ${(process.env.NODE_ENV || 'development').padEnd(30)}║
╚═══════════════════════════════════════╝

Endpoints:
  POST /api/scan        - Scan wallet for dust
  POST /api/estimate    - Estimate consolidation fees
  POST /api/consolidate - Start consolidation job
  GET  /api/status/:id  - Check job status
  GET  /api/prices      - Get token prices
  GET  /health          - Health check
  `);
});

export default app;
