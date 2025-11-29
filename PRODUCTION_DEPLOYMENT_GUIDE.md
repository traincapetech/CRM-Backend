# 🚀 Production Deployment Guide

## 📋 Document Storage in Production

### Current Status
- **Development**: Files stored locally in `./uploads/documents/`
- **Production**: Multiple options available (see below)

## 🎯 **RECOMMENDED FOR 15-20 EMPLOYEES: VPS Storage**

For your team size (15-20 employees), **VPS/Server storage** is the optimal choice:

- **Monthly Cost**: $20-40 (vs $50-200 for cloud)
- **Storage Capacity**: 50GB+ (handles 2,000+ documents)
- **Setup Time**: 2-4 hours with our guide
- **Maintenance**: 1 hour/month

➡️ **See `VPS_SETUP_GUIDE.md` for complete setup instructions**
➡️ **See `TEAM_QUICK_REFERENCE.md` for your specific requirements**

## 🏗️ Production Storage Options

### Option 1: AWS S3 (Recommended) ⭐

**Best for**: Scalable applications, multiple servers, high availability

```bash
# Environment Variables
STORAGE_TYPE=s3
AWS_S3_BUCKET=your-crm-documents-prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret-key
```

**Advantages**:
- ✅ Unlimited storage
- ✅ 99.999999999% (11 9's) durability
- ✅ Global CDN integration
- ✅ Automatic backups
- ✅ Pay-as-you-use pricing

**Monthly Cost Estimate**:
- Storage: ~$0.023/GB
- Requests: ~$0.40/1M requests
- Data transfer: ~$0.09/GB

### Option 2: VPS/Dedicated Server ⭐ **RECOMMENDED FOR YOUR TEAM**

**Best for**: Small to medium applications, cost control, 15-20 employees

```bash
# Environment Variables  
STORAGE_TYPE=local
UPLOAD_PATH=/var/www/crm/uploads/documents
PUBLIC_PATH=/uploads/documents
```

**Server Structure**:
```
/var/www/crm/
├── app/                    # Application code
├── uploads/               # Document storage
│   ├── documents/         # Employee documents
│   └── profile-pictures/  # Profile images
├── backups/              # Automated backups
│   ├── daily/
│   ├── weekly/
│   └── monthly/
└── logs/                 # Application logs
```

**Advantages**:
- ✅ Lower cost
- ✅ Full control
- ✅ No external dependencies

**Disadvantages**:
- ❌ Manual backup required
- ❌ Single point of failure
- ❌ Limited scalability

### Option 3: Google Cloud Storage

**Best for**: Google Cloud ecosystem, competitive pricing

```bash
# Environment Variables
STORAGE_TYPE=gcs
GCS_BUCKET=your-crm-documents-prod
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json
```

### Option 4: Azure Blob Storage

**Best for**: Microsoft ecosystem, enterprise integration

```bash
# Environment Variables
STORAGE_TYPE=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
```

## 🔧 Implementation Steps

### 1. Choose Storage Type

Based on your needs:
- **Startup/Small team**: VPS storage
- **Growing business**: AWS S3
- **Enterprise**: AWS S3 + CloudFront CDN

### 2. Environment Configuration

Create `.env.production`:
```bash
# Basic Configuration
NODE_ENV=production
BASE_URL=https://yourcrm.com

# Database
Mongo_URI=mongodb://username:password@cluster.mongodb.net/crm_production

# Storage (choose one)
STORAGE_TYPE=s3  # or 'local', 'gcs', 'azure'

# AWS S3 (if using S3)
AWS_S3_BUCKET=your-crm-documents
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

### 3. Update Deployment Scripts

**Docker Deployment**:
```dockerfile
# Production Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080

# For local storage, create volume
VOLUME ["/app/uploads"]

CMD ["npm", "start"]
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  crm-app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
    volumes:
      # Only needed for local storage
      - ./uploads:/app/uploads
    env_file:
      - .env.production
```

## 🛡️ Security Configuration

### 1. S3 Bucket Policy (Private Access)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDirectAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-crm-documents/*",
      "Condition": {
        "StringNotEquals": {
          "aws:sourceIp": "your-server-ip"
        }
      }
    }
  ]
}
```

### 2. Server Security (Local Storage)
```bash
# Set proper permissions
sudo chown -R www-data:www-data /var/www/crm/uploads/
sudo chmod -R 755 /var/www/crm/uploads/

# Create backup script
sudo crontab -e
# Add: 0 2 * * * /var/www/crm/scripts/backup.sh
```

## 📊 Cost Comparison (Monthly)

| Storage Type | 100GB | 500GB | 1TB | Bandwidth |
|--------------|-------|-------|-----|-----------|
| **AWS S3** | $2.30 | $11.50 | $23 | $0.09/GB |
| **Google Cloud** | $2.00 | $10.00 | $20 | $0.08/GB |
| **Azure Blob** | $2.40 | $12.00 | $24 | $0.087/GB |
| **VPS (2TB)** | $20-50 | $20-50 | $20-50 | Included |

## 🔄 Migration Strategy

### From Development to Production

1. **Export Current Files**:
```bash
# Create archive of current uploads
tar -czf development-uploads.tar.gz uploads/
```

2. **Upload to Production Storage**:
```bash
# For S3
aws s3 sync uploads/ s3://your-crm-documents/

# For server
scp -r uploads/ user@server:/var/www/crm/
```

3. **Update Database Paths**:
```javascript
// Migration script
const updateFilePaths = async () => {
  const employees = await Employee.find({});
  for (let employee of employees) {
    if (employee.documents) {
      Object.keys(employee.documents).forEach(key => {
        if (employee.documents[key].path) {
          // Update path for new storage
          employee.documents[key].path = employee.documents[key].path.replace(
            'uploads/documents/',
            'documents/' // S3 prefix
          );
        }
      });
      await employee.save();
    }
  }
};
```

## 🚨 Backup Strategy

### For S3 Storage
- ✅ Built-in versioning
- ✅ Cross-region replication
- ✅ Glacier archiving for old files

### For Local Storage
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/crm"
SOURCE_DIR="/var/www/crm/uploads"

# Create backup
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" "$SOURCE_DIR"

# Upload to S3 (optional)
aws s3 cp "$BACKUP_DIR/uploads_$DATE.tar.gz" s3://your-backup-bucket/

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +30 -delete
```

## 📈 Monitoring & Alerts

### Storage Monitoring
```javascript
// Monitor storage usage
const getStorageStats = async () => {
  if (storageType === 's3') {
    // AWS CloudWatch metrics
    const params = {
      MetricName: 'BucketSizeBytes',
      Namespace: 'AWS/S3',
      StartTime: new Date(Date.now() - 24*60*60*1000),
      EndTime: new Date(),
      Period: 3600,
      Statistics: ['Average'],
      Dimensions: [
        {
          Name: 'BucketName',
          Value: process.env.AWS_S3_BUCKET
        }
      ]
    };
  } else {
    // Local storage check
    const { execSync } = require('child_process');
    const usage = execSync('df -h /var/www/crm/uploads').toString();
    console.log('Storage usage:', usage);
  }
};
```

## 🎯 Recommended Production Setup

**For Most Applications**:
1. **Primary**: AWS S3 for document storage
2. **CDN**: CloudFront for fast global access
3. **Backup**: S3 Cross-Region Replication
4. **Monitoring**: CloudWatch + alerts
5. **Security**: Private buckets + signed URLs

**Monthly Cost**: ~$10-50 for typical usage

This setup provides enterprise-grade reliability, security, and scalability for your CRM document storage! 🚀 