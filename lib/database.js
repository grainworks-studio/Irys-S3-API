import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config/config.js';

let db = null;

/**
 * Initialize SQLite database
 * @returns {Promise<Object>} Database instance
 */
export async function initDatabase() {
  if (db) {
    return db;
  }

  try {
    // Ensure data directory exists
    const dataDir = path.dirname(config.database.path);
    await fs.mkdir(dataDir, { recursive: true });

    // Open database connection
    db = await open({
      filename: config.database.path,
      driver: sqlite3.Database
    });

    // Create tables
    await createTables();
    
    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw new Error('Failed to initialize database');
  }
}

/**
 * Create database tables
 */
async function createTables() {
  const createObjectsTable = `
    CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL,
      key TEXT NOT NULL,
      irys_id TEXT NOT NULL UNIQUE,
      content_type TEXT,
      size INTEGER,
      etag TEXT,
      last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0
    )
  `;

  const createBucketsTable = `
    CREATE TABLE IF NOT EXISTS buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0
    )
  `;

  // Create indexes for better performance
  const createIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_bucket_key ON objects(bucket, key)',
    'CREATE INDEX IF NOT EXISTS idx_irys_id ON objects(irys_id)',
    'CREATE INDEX IF NOT EXISTS idx_bucket_name ON buckets(name)',
    'CREATE INDEX IF NOT EXISTS idx_last_modified ON objects(last_modified)'
  ];

  await db.exec(createObjectsTable);
  await db.exec(createBucketsTable);
  
  for (const indexSql of createIndexes) {
    await db.exec(indexSql);
  }
}

/**
 * Store object mapping in database
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @param {Object} irysReceipt - Irys upload receipt
 * @param {string} contentType - MIME type
 * @param {number} size - File size in bytes
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Stored object record
 */
export async function storeObjectMapping(bucket, key, irysReceipt, contentType, size, metadata = {}) {
  const database = await initDatabase();
  
  try {
    // First ensure bucket exists
    await ensureBucketExists(bucket);
    
    // Generate ETag (using Irys transaction ID)
    const etag = `"${irysReceipt.id}"`;
    
    const result = await database.run(
      `INSERT OR REPLACE INTO objects 
       (bucket, key, irys_id, content_type, size, etag, metadata, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        bucket,
        key,
        irysReceipt.id,
        contentType,
        size,
        etag,
        JSON.stringify(metadata)
      ]
    );

    return await getObjectMapping(bucket, key);
  } catch (error) {
    console.error('Error storing object mapping:', error);
    throw new Error('Failed to store object mapping');
  }
}

/**
 * Get object mapping from database
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {Promise<Object|null>} Object record or null
 */
export async function getObjectMapping(bucket, key) {
  const database = await initDatabase();
  
  try {
    const object = await database.get(
      'SELECT * FROM objects WHERE bucket = ? AND key = ? AND is_deleted = 0',
      [bucket, key]
    );

    if (!object) {
      return null;
    }

    return {
      ...object,
      metadata: object.metadata ? JSON.parse(object.metadata) : {}
    };
  } catch (error) {
    console.error('Error getting object mapping:', error);
    throw new Error('Failed to get object mapping');
  }
}

/**
 * Delete object mapping (soft delete)
 * @param {string} bucket - Bucket name
 * @param {string} key - Object key
 * @returns {Promise<boolean>} Success status
 */
export async function deleteObjectMapping(bucket, key) {
  const database = await initDatabase();
  
  try {
    const result = await database.run(
      'UPDATE objects SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE bucket = ? AND key = ? AND is_deleted = 0',
      [bucket, key]
    );

    return result.changes > 0;
  } catch (error) {
    console.error('Error deleting object mapping:', error);
    throw new Error('Failed to delete object mapping');
  }
}

/**
 * List objects in a bucket
 * @param {string} bucket - Bucket name
 * @param {Object} options - List options
 * @returns {Promise<Array>} Array of object records
 */
export async function listObjects(bucket, options = {}) {
  const database = await initDatabase();
  
  const {
    prefix = '',
    marker = '',
    maxKeys = 1000,
    delimiter = ''
  } = options;

  try {
    let sql = 'SELECT * FROM objects WHERE bucket = ? AND is_deleted = 0';
    const params = [bucket];

    if (prefix) {
      sql += ' AND key LIKE ?';
      params.push(`${prefix}%`);
    }

    if (marker) {
      sql += ' AND key > ?';
      params.push(marker);
    }

    sql += ' ORDER BY key';

    if (maxKeys > 0) {
      sql += ' LIMIT ?';
      params.push(maxKeys);
    }

    const objects = await database.all(sql, params);

    return objects.map(obj => ({
      ...obj,
      metadata: obj.metadata ? JSON.parse(obj.metadata) : {}
    }));
  } catch (error) {
    console.error('Error listing objects:', error);
    throw new Error('Failed to list objects');
  }
}

/**
 * Ensure bucket exists in database
 * @param {string} bucketName - Bucket name
 */
async function ensureBucketExists(bucketName) {
  const database = await initDatabase();
  
  try {
    await database.run(
      'INSERT OR IGNORE INTO buckets (name) VALUES (?)',
      [bucketName]
    );
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
    throw new Error('Failed to ensure bucket exists');
  }
}

/**
 * List all buckets
 * @returns {Promise<Array>} Array of bucket records
 */
export async function listBuckets() {
  const database = await initDatabase();
  
  try {
    const buckets = await database.all(
      'SELECT * FROM buckets WHERE is_deleted = 0 ORDER BY name'
    );
    return buckets;
  } catch (error) {
    console.error('Error listing buckets:', error);
    throw new Error('Failed to list buckets');
  }
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Database statistics
 */
export async function getStats() {
  const database = await initDatabase();
  
  try {
    const [objectCount, bucketCount] = await Promise.all([
      database.get('SELECT COUNT(*) as count FROM objects WHERE is_deleted = 0'),
      database.get('SELECT COUNT(*) as count FROM buckets WHERE is_deleted = 0')
    ]);

    return {
      objects: objectCount.count,
      buckets: bucketCount.count
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    throw new Error('Failed to get database statistics');
  }
}