# S3-Compatible API for Irys

A REST API facade that provides S3-compatible endpoints for interacting with Irys (formerly Bundlr Network). This allows existing applications to use familiar S3 semantics while storing data permanently on Arweave via Irys.

## Features

- **S3-Compatible API**: Support for `putObject`, `getObject`, `deleteObject`, and `listObjects` operations
- **Irys Integration**: Seamless uploads to Irys with automatic receipt management
- **Metadata Storage**: SQLite database for mapping S3 bucket/key operations to Irys transaction IDs
- **File Upload Support**: Handle both multipart form data and raw binary uploads
- **Custom Metadata**: Support for S3-style metadata headers (`x-amz-meta-*`)
- **Monitoring**: Built-in health checks, status endpoints, and Prometheus metrics
- **CORS Support**: Full CORS configuration for web applications
- **Error Handling**: S3-compatible error responses

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd s3-irys-api

# Install dependencies
npm install
```

### Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Irys Configuration (REQUIRED)
PRIVATE_KEY=your_ethereum_private_key_here
IRYS_NETWORK=devnet
# Options: mainnet, devnet

# Database Configuration
DB_PATH=./data/s3-irys.db

# API Configuration
MAX_FILE_SIZE=100MB
ENABLE_CORS=true
API_KEY=your_api_key_here  # Optional

# Irys Gateway
IRYS_GATEWAY_URL=https://gateway.irys.xyz
```

### Running the Server

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000` (or your configured port).

## API Documentation

### S3-Compatible Endpoints

#### List All Buckets
```http
GET /
```

#### List Objects in Bucket
```http
GET /{bucket}
GET /{bucket}?prefix=folder/&max-keys=100&marker=lastkey
```

#### Upload Object
```http
PUT /{bucket}/{key}
Content-Type: application/octet-stream
x-amz-meta-author: John Doe

[file content]
```

#### Download Object
```http
GET /{bucket}/{key}
```

#### Delete Object
```http
DELETE /{bucket}/{key}
```

#### Get Object Metadata
```http
HEAD /{bucket}/{key}
```

### Monitoring Endpoints

#### Health Check
```http
GET /health
```

#### Service Status
```http
GET /status
```

#### Prometheus Metrics
```http
GET /metrics
```

## Usage Examples

### JavaScript/Node.js

```javascript
// Using fetch API
const response = await fetch('http://localhost:3000/my-bucket/my-file.txt', {
  method: 'PUT',
  headers: {
    'Content-Type': 'text/plain',
    'x-amz-meta-author': 'John Doe'
  },
  body: 'Hello, Irys!'
});

const result = await response.json();
console.log('Uploaded to Irys:', result.IrysTransactionId);
console.log('Gateway URL:', result.Location);
```

### cURL Examples

```bash
# Upload a file
curl -X PUT http://localhost:3000/documents/readme.txt \
  -H "Content-Type: text/plain" \
  -H "x-amz-meta-author: John Doe" \
  --data-binary @README.md

# Download a file
curl http://localhost:3000/documents/readme.txt

# List objects
curl "http://localhost:3000/documents?prefix=2024/&max-keys=10"

# Delete a file
curl -X DELETE http://localhost:3000/documents/readme.txt
```

### AWS SDK Compatibility

You can use AWS SDK clients by pointing them to your API server:

```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  endpoint: 'http://localhost:3000',
  region: 'us-east-1', // Required but ignored
  credentials: {
    accessKeyId: 'dummy', // Required but ignored
    secretAccessKey: 'dummy' // Required but ignored
  },
  forcePathStyle: true // Important for localhost
});

const command = new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: 'my-file.txt',
  Body: 'Hello from AWS SDK!',
  Metadata: {
    author: 'John Doe'
  }
});

const response = await client.send(command);
```

## Architecture

### Components

1. **Express Server** (`server.js`)
   - Main application server with middleware configuration
   - Routes handling and error management

2. **Irys Client** (`lib/irysClient.js`)
   - Manages connections to Irys network
   - Handles file uploads and receipt processing

3. **Database Layer** (`lib/database.js`)
   - SQLite database for mapping storage
   - Bucket and object metadata management

4. **S3 Controller** (`controllers/s3Controller.js`)
   - S3-compatible API endpoint implementations
   - Request/response transformation

5. **Middleware** (`middleware/index.js`)
   - File upload handling
   - Authentication and error handling

### Data Flow

1. **Upload Process**:
   - Client uploads file via S3 API
   - File is uploaded to Irys network
   - Irys returns transaction ID and receipt
   - Mapping stored in SQLite database
   - S3-compatible response returned

2. **Download Process**:
   - Client requests file via S3 API
   - Database lookup finds Irys transaction ID
   - File fetched from Irys Gateway
   - Stream returned to client with S3 headers

3. **Delete Process**:
   - Client deletes file via S3 API
   - Database mapping marked as deleted
   - Note: Irys data remains immutable on Arweave

## Configuration Options

### Irys Networks

- **devnet**: Test network for development
- **mainnet**: Production network (costs real tokens)

### Supported Tokens

The API currently uses Ethereum for Irys payments. To use other tokens, modify `lib/irysClient.js` and install the appropriate Irys package:

```bash
# For different tokens
npm install @irys/upload-solana    # For Solana
npm install @irys/upload-polygon   # For Polygon
npm install @irys/upload-arbitrum  # For Arbitrum
# ... etc
```

### File Size Limits

Configure maximum file size in `.env`:
```bash
MAX_FILE_SIZE=100MB  # Supports B, KB, MB, GB
```

### API Authentication

Optional API key authentication:
```bash
API_KEY=your-secret-key
```

When configured, clients must include the key:
```http
x-api-key: your-secret-key
```

## Development

### Project Structure

```
s3-irys-api/
├── config/
│   └── config.js          # Configuration management
├── controllers/
│   └── s3Controller.js    # S3 API implementations
├── lib/
│   ├── database.js        # Database operations
│   └── irysClient.js      # Irys network client
├── middleware/
│   └── index.js           # Express middleware
├── routes/
│   ├── healthRoutes.js    # Health & monitoring
│   └── s3Routes.js        # S3 API routes
├── data/                  # SQLite database directory
├── .env.example           # Environment template
├── package.json
├── README.md
└── server.js              # Main server file
```

### Adding New Features

1. **New API Endpoints**: Add to `controllers/s3Controller.js` and `routes/s3Routes.js`
2. **Database Schema**: Modify `lib/database.js` 
3. **Irys Features**: Extend `lib/irysClient.js`
4. **Middleware**: Add to `middleware/index.js`

### Testing

```bash
# Add test dependencies
npm install --save-dev jest supertest

# Run tests
npm test
```
## Troubleshooting

### Common Issues

1. **"Failed to initialize Irys uploader"**
   - Check your `PRIVATE_KEY` is valid
   - Ensure the wallet has sufficient balance for uploads
   - Verify network connectivity to Irys

2. **"Failed to upload to Irys"**
   - Check account balance: larger files require funding
   - Verify file size is within limits
   - Check Irys network status

3. **"Database initialization failed"**
   - Ensure write permissions for `DB_PATH` directory
   - Check disk space availability

4. **CORS Issues**
   - Set `ENABLE_CORS=true` in `.env`
   - Configure client to use `forcePathStyle: true` for AWS SDK

### Logs

The server provides detailed logging for debugging:
- Request/response logging with timing
- Irys upload confirmations
- Database operations
- Error details in development mode

## License

MIT License - see LICENSE file for details.

## Support

- Check the [Irys Documentation](https://docs.irys.xyz)
- Review the troubleshooting section
- Open an issue for bugs or feature requests# Side-Project
