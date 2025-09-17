import axios from 'axios';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import { uploadToIrys } from '../lib/irysClient.js';
import { 
  storeObjectMapping, 
  getObjectMapping, 
  deleteObjectMapping, 
  listObjects,
  listBuckets 
} from '../lib/database.js';
import config from '../config/config.js';

/**
 * S3-compatible putObject operation
 * Upload a file to Irys and store mapping
 */
export async function putObject(req, res) {
  try {
    const { bucket, key } = req.params;
    // With :key+ pattern, the entire path is captured in key parameter
    const fullKey = key;
    
    if (!bucket || !fullKey) {
      return res.status(400).json({
        error: 'MissingParameter',
        message: 'Bucket and Key parameters are required'
      });
    }

    if (!req.file && !req.body) {
      return res.status(400).json({
        error: 'MissingBody',
        message: 'Request body is empty'
      });
    }

    let fileBuffer;
    let contentType;
    let originalName;

    if (req.file) {
      fileBuffer = req.file.buffer;
      contentType = req.file.mimetype;
      originalName = req.file.originalname;
    } else {
      fileBuffer = req.body;
      contentType = req.get('Content-Type') || mime.lookup(fullKey) || 'application/octet-stream';
      originalName = fullKey;
    }

    const customTags = [
      { name: 'Bucket', value: bucket },
      { name: 'Key', value: fullKey },
      { name: 'Upload-Timestamp', value: new Date().toISOString() }
    ];

    const metadata = {};
    Object.keys(req.headers).forEach(header => {
      if (header.startsWith('x-amz-meta-')) {
        const metaKey = header.replace('x-amz-meta-', '');
        metadata[metaKey] = req.headers[header];
        customTags.push({ name: `Meta-${metaKey}`, value: req.headers[header] });
      }
    });

    console.log(`Uploading ${fullKey} to Irys (${fileBuffer.length} bytes)`);

    const irysReceipt = await uploadToIrys(fileBuffer, contentType, customTags);
    const objectRecord = await storeObjectMapping(
      bucket, 
      fullKey, 
      irysReceipt, 
      contentType, 
      fileBuffer.length, 
      metadata
    );

    const gatewayUrl = `${config.irys.gatewayUrl}/${irysReceipt.id}`;

    res.set({
      'ETag': objectRecord.etag,
      'Last-Modified': new Date(objectRecord.last_modified).toUTCString(),
      'Location': gatewayUrl,
      'x-amz-request-id': uuidv4(),
      'x-irys-transaction-id': irysReceipt.id
    });

    res.status(200).json({
      ETag: objectRecord.etag,
      Location: gatewayUrl,
      Bucket: bucket,
      Key: fullKey,
      IrysTransactionId: irysReceipt.id
    });

  } catch (error) {
    console.error('Error in putObject:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to upload object',
      details: error.message
    });
  }
}

/**
 * S3-compatible getObject operation
 * Retrieve a file from Irys via gateway
 */
export async function getObject(req, res) {
  try {
    const { bucket, key } = req.params;
    // With :key+ pattern, the entire path is captured in key parameter
    const fullKey = key;

    if (!bucket || !fullKey) {
      return res.status(400).json({
        error: 'MissingParameter',
        message: 'Bucket and Key parameters are required'
      });
    }

    const objectRecord = await getObjectMapping(bucket, fullKey);
    
    if (!objectRecord) {
      return res.status(404).json({
        error: 'NoSuchKey',
        message: 'The specified key does not exist'
      });
    }

    const gatewayUrl = `${config.irys.gatewayUrl}/${objectRecord.irys_id}`;

    try {
      console.log(`Fetching ${fullKey} from Irys Gateway: ${gatewayUrl}`);
      const response = await axios.get(gatewayUrl, {
        responseType: 'stream',
        timeout: 30000
      });

      res.set({
        'Content-Type': objectRecord.content_type,
        'Content-Length': objectRecord.size,
        'ETag': objectRecord.etag,
        'Last-Modified': new Date(objectRecord.last_modified).toUTCString(),
        'Accept-Ranges': 'bytes',
        'x-amz-request-id': uuidv4(),
        'x-irys-transaction-id': objectRecord.irys_id
      });

      if (objectRecord.metadata) {
        Object.keys(objectRecord.metadata).forEach(metaKey => {
          res.set(`x-amz-meta-${metaKey}`, objectRecord.metadata[metaKey]);
        });
      }

      response.data.pipe(res);

    } catch (fetchError) {
      console.error('Error fetching from Irys Gateway:', fetchError);
      
      if (fetchError.response?.status === 404) {
        return res.status(404).json({
          error: 'NoSuchKey',
          message: 'The specified key does not exist on Irys'
        });
      }
      
      throw fetchError;
    }

  } catch (error) {
    console.error('Error in getObject:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to retrieve object',
      details: error.message
    });
  }
}

/**
 * S3-compatible deleteObject operation
 * Soft delete object mapping (Irys data is immutable)
 */
export async function deleteObject(req, res) {
  try {
    const { bucket, key } = req.params;
    // With :key+ pattern, the entire path is captured in key parameter
    const fullKey = key;

    if (!bucket || !fullKey) {
      return res.status(400).json({
        error: 'MissingParameter',
        message: 'Bucket and Key parameters are required'
      });
    }

    const objectRecord = await getObjectMapping(bucket, fullKey);
    
    if (!objectRecord) {
      return res.status(204).send();
    }

    const deleted = await deleteObjectMapping(bucket, fullKey);
    
    if (deleted) {
      console.log(`Soft deleted object: ${bucket}/${fullKey}`);
    }

    res.set({
      'x-amz-request-id': uuidv4(),
      'x-irys-transaction-id': objectRecord.irys_id
    });

    res.status(204).send();

  } catch (error) {
    console.error('Error in deleteObject:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to delete object',
      details: error.message
    });
  }
}

/**
 * S3-compatible listObjects operation
 * List objects in a bucket with S3-compatible pagination
 */
export async function listObjectsV1(req, res) {
  try {
    const { bucket } = req.params;
    const {
      prefix = '',
      marker = '',
      'max-keys': maxKeysParam = '1000',
      delimiter = ''
    } = req.query;

    if (!bucket) {
      return res.status(400).json({
        error: 'MissingParameter',
        message: 'Bucket parameter is required'
      });
    }

    const maxKeys = Math.min(parseInt(maxKeysParam, 10), 1000);

    const objects = await listObjects(bucket, {
      prefix,
      marker,
      maxKeys: maxKeys + 1, // Get one extra to check if there are more
      delimiter
    });

    const isTruncated = objects.length > maxKeys;
    const returnObjects = isTruncated ? objects.slice(0, maxKeys) : objects;
    
    const nextMarker = isTruncated ? returnObjects[returnObjects.length - 1].key : null;

    const response = {
      Name: bucket,
      Prefix: prefix,
      Marker: marker,
      MaxKeys: maxKeys,
      IsTruncated: isTruncated,
      Contents: returnObjects.map(obj => ({
        Key: obj.key,
        LastModified: new Date(obj.last_modified).toISOString(),
        ETag: obj.etag,
        Size: obj.size,
        StorageClass: 'STANDARD',
        Owner: {
          DisplayName: 'irys-user',
          ID: 'irys-user'
        }
      }))
    };

    if (nextMarker) {
      response.NextMarker = nextMarker;
    }

    res.set({
      'Content-Type': 'application/xml',
      'x-amz-request-id': uuidv4()
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in listObjects:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to list objects',
      details: error.message
    });
  }
}

/**
 * S3-compatible listBuckets operation
 * List all available buckets
 */
export async function listAllBuckets(req, res) {
  try {
    const buckets = await listBuckets();

    const response = {
      Owner: {
        DisplayName: 'irys-user',
        ID: 'irys-user'
      },
      Buckets: buckets.map(bucket => ({
        Name: bucket.name,
        CreationDate: new Date(bucket.created_at).toISOString()
      }))
    };

    res.set({
      'Content-Type': 'application/xml',
      'x-amz-request-id': uuidv4()
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in listBuckets:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to list buckets',
      details: error.message
    });
  }
}

/**
 * HEAD operation for objects
 * Return object metadata without body
 */
export async function headObject(req, res) {
  try {
    const { bucket, key } = req.params;
    // With :key+ pattern, the entire path is captured in key parameter
    const fullKey = key;

    if (!bucket || !fullKey) {
      return res.status(400).json({
        error: 'MissingParameter',
        message: 'Bucket and Key parameters are required'
      });
    }

    const objectRecord = await getObjectMapping(bucket, fullKey);
    
    if (!objectRecord) {
      return res.status(404).json({
        error: 'NoSuchKey',
        message: 'The specified key does not exist'
      });
    }

    res.set({
      'Content-Type': objectRecord.content_type,
      'Content-Length': objectRecord.size,
      'ETag': objectRecord.etag,
      'Last-Modified': new Date(objectRecord.last_modified).toUTCString(),
      'Accept-Ranges': 'bytes',
      'x-amz-request-id': uuidv4(),
      'x-irys-transaction-id': objectRecord.irys_id
    });

    if (objectRecord.metadata) {
      Object.keys(objectRecord.metadata).forEach(metaKey => {
        res.set(`x-amz-meta-${metaKey}`, objectRecord.metadata[metaKey]);
      });
    }

    res.status(200).send();

  } catch (error) {
    console.error('Error in headObject:', error);
    res.status(500).json({
      error: 'InternalError',
      message: 'Failed to get object metadata',
      details: error.message
    });
  }
}