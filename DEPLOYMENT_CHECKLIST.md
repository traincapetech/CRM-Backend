# 🚀 Production Deployment Checklist

## Pre-Deployment Setup

### 1. Choose Storage Strategy ☑️
- [ ] **Option A: AWS S3** (Recommended for scale)
  - [ ] Create AWS account
  - [ ] Create S3 bucket: `your-crm-documents-prod`
  - [ ] Configure IAM user with S3 permissions
  - [ ] Note down: Access Key ID & Secret Access Key
  
- [ ] **Option B: VPS Storage** (Cost-effective)
  - [ ] Provision VPS (minimum 20GB storage)
  - [ ] Create directory: `/var/www/crm/uploads/`
  - [ ] Set proper permissions: `chmod 755`
  - [ ] Setup backup strategy

### 2. Environment Configuration ☑️
- [ ] Create `.env.production` file
- [ ] Set `NODE_ENV=production`
- [ ] Configure production database URL
- [ ] Set strong JWT secret (minimum 32 characters)
- [ ] Configure storage type and credentials

### 3. Security Setup ☑️
- [ ] Update CORS origins for production domain
- [ ] Configure rate limiting
- [ ] Set up HTTPS/SSL certificate
- [ ] Review file upload limits
- [ ] Test authentication endpoints

## Deployment Steps

### 4. Code Preparation ☑️
- [ ] Update storage configuration in `config/storage.js`
- [ ] Ensure `.gitignore` excludes sensitive files
- [ ] Run security audit: `npm audit`
- [ ] Build production bundle
- [ ] Test in staging environment

### 5. Server Setup ☑️
- [ ] Install Node.js 18+ on production server
- [ ] Install PM2 for process management: `npm install -g pm2`
- [ ] Clone repository to server
- [ ] Install dependencies: `npm ci --production`
- [ ] Create uploads directory structure

### 6. Database Migration ☑️
- [ ] Setup production MongoDB instance
- [ ] Import development data (if needed)
- [ ] Update database connection strings
- [ ] Test database connectivity

### 7. File Migration ☑️
**If migrating from development:**
- [ ] Archive development uploads: `tar -czf dev-uploads.tar.gz uploads/`
- [ ] Transfer to production storage
- [ ] Update database file paths
- [ ] Verify file access through application

## Post-Deployment Verification

### 8. Functionality Testing ☑️
- [ ] Test user registration/login
- [ ] Test file upload functionality
- [ ] Test file download/view
- [ ] Test document management features
- [ ] Verify employee data access

### 9. Performance & Monitoring ☑️
- [ ] Setup application monitoring (PM2 logs)
- [ ] Configure storage monitoring
- [ ] Test backup procedures
- [ ] Monitor memory and CPU usage
- [ ] Test application under load

### 10. Security Verification ☑️
- [ ] Verify no sensitive files in Git history
- [ ] Test file access permissions
- [ ] Verify HTTPS enforcement
- [ ] Test rate limiting
- [ ] Check for exposed sensitive endpoints

## Ongoing Maintenance

### 11. Backup Strategy ☑️
- [ ] **For S3**: Enable versioning and cross-region replication
- [ ] **For Local**: Setup automated daily backups
- [ ] Test restore procedures
- [ ] Document backup locations

### 12. Monitoring & Alerts ☑️
- [ ] Setup uptime monitoring
- [ ] Configure storage usage alerts
- [ ] Monitor application errors
- [ ] Setup email notifications for critical issues

## Production Environment Variables Template

```bash
# Basic Configuration
NODE_ENV=production
PORT=8080
BASE_URL=https://yourcrm.com

# Database
Mongo_URI=mongodb://username:password@cluster.mongodb.net/crm_production

# JWT
JWT_SECRET=your-super-secure-32-character-secret
JWT_EXPIRE=30d

# Storage (choose one option)

# Option 1: AWS S3
STORAGE_TYPE=s3
AWS_S3_BUCKET=your-crm-documents-prod
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# Option 2: Local Storage
STORAGE_TYPE=local
UPLOAD_PATH=/var/www/crm/uploads/documents
PUBLIC_PATH=/uploads/documents

# Security
CORS_ORIGIN=https://yourcrm.com
RATE_LIMIT_MAX=100
```

## Common Issues & Solutions

### Issue: Files not accessible after deployment
**Solution**: 
- Check file permissions (755 for directories, 644 for files)
- Verify storage configuration
- Check BASE_URL setting

### Issue: Upload fails in production
**Solution**:
- Verify upload directory exists and is writable
- Check file size limits
- Ensure adequate disk space

### Issue: S3 access denied
**Solution**:
- Verify AWS credentials
- Check S3 bucket permissions
- Ensure IAM user has proper policies

## Emergency Rollback Plan

### If deployment fails:
1. [ ] Revert to previous code version
2. [ ] Restore database backup
3. [ ] Restore file storage backup
4. [ ] Update DNS if needed
5. [ ] Notify users of any issues

---

**Deployment Status**: ⏳ In Progress / ✅ Complete / ❌ Failed

**Notes**: 
_Document any specific configurations or issues encountered during deployment_ 