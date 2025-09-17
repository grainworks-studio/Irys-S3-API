import express from 'express';
import { getBalance } from '../lib/irysClient.js';
import { getStats } from '../lib/database.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'S3-Irys API'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Service status endpoint with detailed information
 */
router.get('/status', async (req, res) => {
  try {
    // Get Irys account balance
    let balance = null;
    let balanceError = null;
    
    try {
      const rawBalance = await getBalance();
      balance = rawBalance.toString();
    } catch (err) {
      balanceError = err.message;
    }

    // Get database statistics
    let dbStats = null;
    let dbError = null;
    
    try {
      dbStats = await getStats();
    } catch (err) {
      dbError = err.message;
    }

    const status = {
      service: 'S3-Irys API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      irys: {
        connected: !balanceError,
        balance: balance,
        error: balanceError
      },
      database: {
        connected: !dbError,
        stats: dbStats,
        error: dbError
      },
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };

    const httpStatus = (!balanceError && !dbError) ? 200 : 503;
    res.status(httpStatus).json(status);

  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Metrics endpoint for monitoring
 */
router.get('/metrics', async (req, res) => {
  try {
    const stats = await getStats();
    const memUsage = process.memoryUsage();
    
    // Simple Prometheus-style metrics
    const metrics = [
      `# HELP s3_irys_objects_total Total number of objects stored`,
      `# TYPE s3_irys_objects_total counter`,
      `s3_irys_objects_total ${stats.objects}`,
      ``,
      `# HELP s3_irys_buckets_total Total number of buckets`,
      `# TYPE s3_irys_buckets_total counter`, 
      `s3_irys_buckets_total ${stats.buckets}`,
      ``,
      `# HELP nodejs_memory_usage_bytes Memory usage in bytes`,
      `# TYPE nodejs_memory_usage_bytes gauge`,
      `nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}`,
      `nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}`,
      `nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}`,
      `nodejs_memory_usage_bytes{type="external"} ${memUsage.external}`,
      ``,
      `# HELP nodejs_uptime_seconds Process uptime in seconds`,
      `# TYPE nodejs_uptime_seconds gauge`,
      `nodejs_uptime_seconds ${process.uptime()}`,
      ``
    ].join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate metrics',
      details: error.message
    });
  }
});

export default router;