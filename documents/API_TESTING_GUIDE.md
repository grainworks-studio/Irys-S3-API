# S3-Irys API Testing Guide

Complete guide for testing all API endpoints with practical examples.

## Quick Setup

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **API Key:** `your_api_key_here` (from `.env` file)

3. **Base URL:** `http://localhost:3000`

4. **Documentation:** http://localhost:3000/docs

## Authentication

All endpoints (except health checks) require the API key in the header:
```bash
-H "x-api-key: your_api_key_here"
```

## 1. Health & Status Endpoints

### Health Check (No auth required)
```bash
curl -X GET "http://localhost:3000/health"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-17T10:30:00.000Z",
  "service": "S3-Irys API"
}
```

### Service Status
```bash
curl -X GET "http://localhost:3000/status"
```

### Metrics (Prometheus format)
```bash
curl -X GET "http://localhost:3000/metrics"
```

## 2. Bucket Operations

### List All Buckets
```bash
curl -X GET "http://localhost:3000/" \
  -H "x-api-key: your_api_key_here"
```

**Expected Response:**
```json
{
  "Owner": {
    "DisplayName": "irys-user",
    "ID": "irys-user"
  },
  "Buckets": [
    {
      "Name": "my-bucket",
      "CreationDate": "2025-09-17T10:30:00.000Z"
    }
  ]
}
```

## 3. Object Listing

### List Objects in Bucket
```bash
# Basic listing
curl -X GET "http://localhost:3000/my-bucket" \
  -H "x-api-key: your_api_key_here"

# With prefix filter
curl -X GET "http://localhost:3000/my-bucket?prefix=documents/" \
  -H "x-api-key: your_api_key_here"

# With pagination
curl -X GET "http://localhost:3000/my-bucket?max-keys=10&marker=last-key" \
  -H "x-api-key: your_api_key_here"
```

**Expected Response:**
```json
{
  "Name": "my-bucket",
  "Prefix": "",
  "Marker": "",
  "MaxKeys": 1000,
  "IsTruncated": false,
  "Contents": [
    {
      "Key": "file.txt",
      "LastModified": "2025-09-17T10:30:00.000Z",
      "ETag": "d41d8cd98f00b204e9800998ecf8427e",
      "Size": 1024,
      "StorageClass": "STANDARD"
    }
  ]
}
```

## 4. Object Upload (PUT)

### Upload Text File
```bash
curl -X PUT "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: text/plain" \
  -d "Hello, World!"
```

### Upload Binary File
```bash
curl -X PUT "http://localhost:3000/my-bucket/documents/file.pdf" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/pdf" \
  --data-binary @/path/to/your/file.pdf
```

### Upload with Custom Metadata
```bash
curl -X PUT "http://localhost:3000/my-bucket/documents/report.pdf" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/pdf" \
  -H "x-amz-meta-author: John Doe" \
  -H "x-amz-meta-project: Project Alpha" \
  -H "x-amz-meta-version: 1.0" \
  --data-binary @report.pdf
```

### Upload Nested Path
```bash
curl -X PUT "http://localhost:3000/my-bucket/folder/subfolder/file.txt" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: text/plain" \
  -d "Nested file content"
```

### Upload JSON Data
```bash
curl -X PUT "http://localhost:3000/my-bucket/data.json" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from JSON", "data": [1, 2, 3]}'
```

**Expected Upload Response:**
```json
{
  "ETag": "d41d8cd98f00b204e9800998ecf8427e",
  "Location": "https://gateway.irys.xyz/abc123xyz789",
  "Bucket": "my-bucket",
  "Key": "hello.txt",
  "IrysTransactionId": "abc123xyz789"
}
```

## 5. Object Download (GET)

### Download File
```bash
# Download and save to file
curl -X GET "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here" \
  -o downloaded-hello.txt

# View content directly
curl -X GET "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here"
```

### Download with Headers
```bash
curl -X GET "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here" \
  -v
```

### Download Nested Path
```bash
curl -X GET "http://localhost:3000/my-bucket/folder/subfolder/file.txt" \
  -H "x-api-key: your_api_key_here"
```

## 6. Object Metadata (HEAD)

### Get Object Metadata
```bash
curl -X HEAD "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here" \
  -v
```

**Expected Headers:**
```
Content-Type: text/plain
Content-Length: 13
ETag: "d41d8cd98f00b204e9800998ecf8427e"
Last-Modified: Tue, 17 Sep 2025 10:30:00 GMT
x-irys-transaction-id: abc123xyz789
x-amz-meta-author: John Doe (if set during upload)
```

## 7. Object Deletion (DELETE)

### Delete Object
```bash
curl -X DELETE "http://localhost:3000/my-bucket/hello.txt" \
  -H "x-api-key: your_api_key_here"
```

**Expected Response:** HTTP 204 No Content

### Delete Nested Object
```bash
curl -X DELETE "http://localhost:3000/my-bucket/folder/subfolder/file.txt" \
  -H "x-api-key: your_api_key_here"
```

## 8. Complete Testing Workflow

Here's a complete test sequence:

```bash
# 1. Check health
curl -X GET "http://localhost:3000/health"

# 2. List buckets (should be empty initially)
curl -X GET "http://localhost:3000/" \
  -H "x-api-key: your_api_key_here"

# 3. Upload a test file
curl -X PUT "http://localhost:3000/test-bucket/sample.txt" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: text/plain" \
  -d "This is a test file"

# 4. List buckets (should now show test-bucket)
curl -X GET "http://localhost:3000/" \
  -H "x-api-key: your_api_key_here"

# 5. List objects in bucket
curl -X GET "http://localhost:3000/test-bucket" \
  -H "x-api-key: your_api_key_here"

# 6. Get object metadata
curl -X HEAD "http://localhost:3000/test-bucket/sample.txt" \
  -H "x-api-key: your_api_key_here" \
  -v

# 7. Download the file
curl -X GET "http://localhost:3000/test-bucket/sample.txt" \
  -H "x-api-key: your_api_key_here"

# 8. Upload a nested file
curl -X PUT "http://localhost:3000/test-bucket/folder/nested.txt" \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: text/plain" \
  -d "Nested file content"

# 9. List with prefix
curl -X GET "http://localhost:3000/test-bucket?prefix=folder/" \
  -H "x-api-key: your_api_key_here"

# 10. Delete objects
curl -X DELETE "http://localhost:3000/test-bucket/sample.txt" \
  -H "x-api-key: your_api_key_here"

curl -X DELETE "http://localhost:3000/test-bucket/folder/nested.txt" \
  -H "x-api-key: your_api_key_here"
```

## 9. Error Testing

### Test Invalid API Key
```bash
curl -X GET "http://localhost:3000/" \
  -H "x-api-key: invalid-key"
```

**Expected Response:** HTTP 401
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

### Test Missing API Key
```bash
curl -X GET "http://localhost:3000/"
```

### Test Non-existent Object
```bash
curl -X GET "http://localhost:3000/my-bucket/nonexistent.txt" \
  -H "x-api-key: your_api_key_here"
```

**Expected Response:** HTTP 404
```json
{
  "error": "NoSuchKey",
  "message": "The specified key does not exist"
}
```

### Test File Too Large
Upload a file larger than the configured limit (default 100MB).

## 10. Using with Postman

1. **Import Collection:** Use the OpenAPI spec at http://localhost:3000/openapi.json
2. **Set Environment Variables:**
   - `baseUrl`: `http://localhost:3000`
   - `apiKey`: `your_api_key_here`
3. **Authorization:** Add `x-api-key` header with `{{apiKey}}` value

## 11. Browser Testing

Visit http://localhost:3000/docs for the interactive Swagger UI where you can:
1. Click "Authorize" and enter your API key
2. Try all endpoints directly from the browser
3. See real-time request/response examples
4. Test file uploads with the built-in file picker

## Notes

- **Nested Paths:** Support URLs like `/bucket/folder/subfolder/file.ext`
- **File Types:** All file types supported (binary, text, JSON, etc.)
- **Metadata:** Use `x-amz-meta-*` headers for custom metadata
- **Irys Network:** Files are stored on Irys testnet by default
- **Deletion:** Only removes local mapping; Irys data is immutable
- **CORS:** Enabled for web browser testing