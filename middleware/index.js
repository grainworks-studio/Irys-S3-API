import multer from 'multer';
import config from '../config/config.js';

// Multer configuration for file uploads
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: parseSize(config.api.maxFileSize)
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for S3 compatibility
    cb(null, true);
  }
});

/**
 * Parse size string to bytes
 * @param {string} size - Size string (e.g., "100MB", "1GB")
 * @returns {number} Size in bytes
 */
function parseSize(size) {
  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };

  const match = size.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match) {
    return 100 * 1024 * 1024; // Default 100MB
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  return Math.floor(value * (units[unit] || 1));
}

/**
 * Middleware to handle raw file uploads for PUT operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function handleRawUpload(req, res, next) {
  // Check if content type suggests multipart data
  const contentType = req.get('Content-Type') || '';
  
  if (contentType.includes('multipart/form-data')) {
    // Use multer for multipart uploads
    upload.single('file')(req, res, next);
  } else {
    // Handle raw binary data
    const chunks = [];
    let totalSize = 0;
    const maxSize = parseSize(config.api.maxFileSize);

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      
      if (totalSize > maxSize) {
        return res.status(413).json({
          error: 'EntityTooLarge',
          message: `File size exceeds maximum allowed size of ${config.api.maxFileSize}`
        });
      }
      
      chunks.push(chunk);
    });

    req.on('end', () => {
      req.body = Buffer.concat(chunks);
      next();
    });

    req.on('error', (err) => {
      console.error('Error reading request body:', err);
      res.status(400).json({
        error: 'BadRequest',
        message: 'Error reading request body'
      });
    });
  }
}

/**
 * API Key authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function authenticateApiKey(req, res, next) {
  if (!config.api.apiKey) {
    // No API key configured, skip authentication
    return next();
  }

  const providedKey = req.get('x-api-key') || req.query.apiKey;
  
  if (!providedKey || providedKey !== config.api.apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }

  next();
}

/**
 * Error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'EntityTooLarge',
        message: `File size exceeds maximum allowed size of ${config.api.maxFileSize}`
      });
    }
  }

  // Default error response
  res.status(500).json({
    error: 'InternalError',
    message: 'An internal error occurred',
    details: config.server.nodeEnv === 'development' ? err.message : undefined
  });
}

/**
 * Request logging middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

/**
 * CORS middleware configuration
 */
export const corsOptions = {
  origin: true, // Allow all origins for S3 compatibility
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'x-amz-*',
    'ETag',
    'Last-Modified'
  ],
  exposedHeaders: [
    'ETag',
    'Last-Modified',
    'x-amz-request-id',
    'x-irys-transaction-id'
  ]
};