import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/config.js';
import { initDatabase } from './lib/database.js';
import { getIrysUploader } from './lib/irysClient.js';
import s3Routes from './routes/s3Routes.js';
import healthRoutes from './routes/healthRoutes.js';
import { 
  corsOptions, 
  errorHandler, 
  requestLogger 
} from './middleware/index.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/**
 * Initialize the server
 */
async function initServer() {
  try {
    console.log('🚀 Starting S3-Irys API Server...');
    
    console.log('📊 Initializing database...');
    await initDatabase();
    console.log('✅ Database initialized');
    
    console.log('🌐 Connecting to Irys...');
    await getIrysUploader();
    console.log('✅ Connected to Irys');
    
    console.log('🎯 Server initialization complete');
    
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    process.exit(1);
  }
}

/**
 * Configure Express middleware
 */
function configureMiddleware() {
  app.use(helmet({
    crossOriginEmbedderPolicy: false // Allow CORS
  }));
  
  if (config.api.enableCors) {
    app.use(cors(corsOptions));
  }
  
  app.use(requestLogger);
  app.use(express.json({ limit: '1mb' }));
}

/**
 * Configure routes
 */
function configureRoutes() {
  app.use('/', healthRoutes);
  
  const openapiPath = path.join(__dirname, 'openapi.yaml');
  let openapiDoc = null;
  try {
    const yamlText = fs.readFileSync(openapiPath, 'utf8');
    openapiDoc = yaml.load(yamlText);
    console.log('✅ OpenAPI spec loaded successfully');
  } catch (e) {
    console.warn('⚠️ OpenAPI spec not found or failed to parse:', e.message);
  }
  
  app.get('/openapi.json', (req, res) => {
    if (!openapiDoc) return res.status(404).json({ error: 'OpenAPI spec not available' });
    res.setHeader('Content-Type', 'application/json');
    res.json(openapiDoc);
  });

  // Swagger UI setup
  if (openapiDoc) {
    console.log('🔧 Setting up Swagger UI at /docs');
    const swaggerOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'S3-Irys API Documentation',
      explorer: true,
      swaggerOptions: {
        persistAuthorization: true
      }
    };
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, swaggerOptions));
  } else {
    app.get('/docs', (req, res) => {
      res.status(500).json({ error: 'API documentation not available - OpenAPI spec failed to load' });
    });
  }
  
  app.use('/', s3Routes);
  app.use((req, res) => {
    res.status(404).json({
      error: 'NoSuchBucket',
      message: 'The specified resource does not exist'
    });
  });
  
  app.use(errorHandler);
}

/**
 * Start the server
 */
async function startServer() {
  await initServer();
  configureMiddleware();
  configureRoutes();
  
  const port = config.server.port;
  
  app.listen(port, () => {
    console.log('');
    console.log('🎉 S3-Irys API Server is running!');
    console.log('');
    console.log(`📍 Server URL: http://localhost:${port}`);
    console.log(`🏥 Health Check: http://localhost:${port}/health`);
    console.log(`📊 Status: http://localhost:${port}/status`);
    console.log(`📈 Metrics: http://localhost:${port}/metrics`);
    console.log(`📚 API Docs: http://localhost:${port}/docs`);
    console.log(`📄 OpenAPI Spec: http://localhost:${port}/openapi.json`);
    console.log('');
    console.log('📚 API Endpoints:');
    console.log(`   GET    /                    - List all buckets`);
    console.log(`   GET    /{bucket}            - List objects in bucket`);
    console.log(`   PUT    /{bucket}/{key}      - Upload object`);
    console.log(`   GET    /{bucket}/{key}      - Download object`);
    console.log(`   DELETE /{bucket}/{key}      - Delete object`);
    console.log(`   HEAD   /{bucket}/{key}      - Get object metadata`);
    console.log('');
    console.log(`🔧 Environment: ${config.server.nodeEnv}`);
    console.log(`🌐 Irys Network: ${config.irys.network}`);
    console.log(`🔐 API Key Required: ${config.api.apiKey ? 'Yes' : 'No'}`);
    console.log('');
  });
}

process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});