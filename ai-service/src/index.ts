import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/settings';
import { logger } from './config/logger';
import { initDatabase } from './db/connection';
import builderRoutes from './routes/builder';
import copilotRoutes from './routes/copilot';
import ragRoutes from './routes/rag';
import workflowRoutes from './routes/workflow';
import indexingRoutes from './routes/indexing';
import adminRoutes from './routes/admin';
import documentsRoutes from './routes/documents';
import { authMiddleware, sessionAuthMiddleware, adminAuthMiddleware } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/ai/health', async (req, res) => {
  try {
    const { pool } = await import('./db/connection');
    await pool.query('SELECT 1');
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

app.use('/ai/builder', sessionAuthMiddleware, builderRoutes);
app.use('/ai/copilot', sessionAuthMiddleware, copilotRoutes);
app.use('/ai/rag', sessionAuthMiddleware, ragRoutes);
app.use('/ai/workflow', authMiddleware, workflowRoutes);
app.use('/ai/indexing', adminAuthMiddleware, indexingRoutes);
app.use('/ai/admin', adminRoutes);
app.use('/ai/documents', sessionAuthMiddleware, documentsRoutes);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    }
  });
});

let dbInitialized = false;

async function initDatabaseWithRetry(maxRetries = 3, delayMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await initDatabase();
      dbInitialized = true;
      logger.info('Database initialized');
      return true;
    } catch (error) {
      logger.warn(`Database connection attempt ${i + 1}/${maxRetries} failed:`, error);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  logger.warn('Database initialization failed after all retries - AI service will run in limited mode');
  return false;
}

async function start() {
  app.listen(config.port, '0.0.0.0', () => {
    logger.info(`AI Service running on port ${config.port}`);
  });

  initDatabaseWithRetry().then(success => {
    if (success) {
      logger.info('AI Service fully operational with database');
    } else {
      logger.warn('AI Service running without database - some features may be limited');
    }
  });
}

start();
