import dotenv from 'dotenv';

dotenv.config()

export const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  irys: {
    privateKey: process.env.PRIVATE_KEY,
    network: process.env.IRYS_NETWORK || 'devnet',
    gatewayUrl: process.env.IRYS_GATEWAY_URL || 'https://gateway.irys.xyz'
  },
  database: {
    path: process.env.DB_PATH || './data/s3-irys.db',
  },
  api: {
    maxFileSize: process.env.MAX_FILE_SIZE || '100mb',
    enableCors: process.env.ENABLE_CORS === 'true',
    apiKey: process.env.API_KEY
  },
};

export default config;