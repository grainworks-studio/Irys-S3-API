import express from 'express';
import { 
  putObject, 
  getObject, 
  deleteObject, 
  listObjectsV1, 
  listAllBuckets,
  headObject 
} from '../controllers/s3Controller.js';
import { handleRawUpload, authenticateApiKey } from '../middleware/index.js';

const router = express.Router();

router.use(authenticateApiKey);

/**
 * S3-Compatible API Routes
 * 
 * Route Pattern Matching:
 * - GET / - List all buckets
 * - GET /{bucket} - List objects in bucket
 * - PUT /{bucket}/{key} - Upload object
 * - GET /{bucket}/{key} - Download object  
 * - DELETE /{bucket}/{key} - Delete object
 * - HEAD /{bucket}/{key} - Get object metadata
 */

router.get('/', listAllBuckets);

router.use('/:bucket', (req, res, next) => {
  const remainder = req.path.replace(/^\/+/, '');

  if (!remainder) {
    if (req.method === 'GET') {
      return listObjectsV1(req, res);
    }
    if (req.method === 'OPTIONS') {
      return res.status(200).send();
    }
    return res.status(405).send('Method Not Allowed');
  }

  req.params.key = decodeURIComponent(remainder);

  if (req.method === 'PUT') {
    return handleRawUpload(req, res, (err) => {
      if (err) return next(err);
      return putObject(req, res);
    });
  }
  if (req.method === 'GET') {
    return getObject(req, res);
  }
  if (req.method === 'DELETE') {
    return deleteObject(req, res);
  }
  if (req.method === 'HEAD') {
    return headObject(req, res);
  }
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }
  return res.status(405).send('Method Not Allowed');
});

export default router;