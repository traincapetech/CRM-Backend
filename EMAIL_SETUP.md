# Email Notification Setup Guide

## Overview
The CRM now automatically sends email notifications when sales are updated:

1. **Payment Confirmation Email** - Sent when token amount is updated
2. **Service Delivery Email** - Sent when status changes to "Completed"

## Multi-Provider Email Support

The system automatically detects the email provider based on the sales person's email domain and uses the appropriate SMTP configuration:

### Supported Providers

#### 1. **Hostinger Email** (traincapetech.in)
```env
HOSTINGER_EMAIL_PASS=your-hostinger-email-password
```

#### 2. **Gmail** (gmail.com)
```env
GMAIL_APP_PASS=your-gmail-app-password
```

#### 3. **Outlook/Hotmail** (outlook.com, hotmail.com, live.com)
```env
OUTLOOK_EMAIL_PASS=your-outlook-password
```

#### 4. **Yahoo** (yahoo.com, yahoo.in)
```env
YAHOO_EMAIL_PASS=your-yahoo-password
```

#### 5. **Generic SMTP** (fallback for other providers)
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
EMAIL_PASS=your-email-password
```

## Environment Variables Setup

### For Hostinger (Primary - traincapetech.in emails)
```env
HOSTINGER_EMAIL_PASS=your_hostinger_email_password
```

### For Multiple Providers (Optional)
```env
GMAIL_APP_PASS=gmail_app_password
OUTLOOK_EMAIL_PASS=outlook_password
YAHOO_EMAIL_PASS=yahoo_password
EMAIL_PASS=fallback_password
```

## How It Works

1. **Sales person updates sale** (e.g., Saurav updates token amount)
2. **System detects email domain** (saurav@traincapetech.in → Hostinger)
3. **Uses appropriate SMTP config** (Hostinger SMTP settings)
4. **Sends email FROM sales person's email** (saurav@traincapetech.in)
5. **Customer receives email** from the actual sales person
6. **Sales person gets CC copy**

## Email Provider Configurations

### Hostinger Setup
- **SMTP Server**: smtp.hostinger.com
- **Port**: 587
- **Security**: STARTTLS
- **Authentication**: Email + Password

### Gmail Setup
1. Enable 2-Factor Authentication
2. Generate App Password:
   - Google Account → Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
   - Use as GMAIL_APP_PASS

### Outlook Setup
- Use regular email password
- Or generate app password if 2FA enabled

### Yahoo Setup
- Generate app password:
  - Yahoo Account → Security → Generate app password
  - Use as YAHOO_EMAIL_PASS

## Email Templates

### Payment Confirmation
- **Trigger**: When `tokenAmount` is updated in a sale
- **From**: Sales person's email (e.g., saurav@traincapetech.in)
- **To**: Customer email
- **CC**: Sales person email
- **Content**: Dynamic payment details with pending amount

### Service Delivery
- **Trigger**: When sale `status` changes to "Completed"
- **From**: Sales person's email
- **To**: Customer email
- **CC**: Sales person email
- **Content**: Service completion confirmation

## Frontend Notifications

Users see real-time toast messages:
- ✅ "Payment confirmation email sent"
- ✅ "Service delivery email sent" 
- ⚠️ "Customer email not available"
- ⚠️ "Sales person email not available"
- ❌ "Email authentication failed - check email credentials"

## Testing Scenarios

### Test 1: Hostinger Email (Primary)
1. Sales person: saurav@traincapetech.in
2. Update sale token amount
3. Should use Hostinger SMTP
4. Customer receives email from saurav@traincapetech.in

### Test 2: Gmail Sales Person
1. Sales person: someone@gmail.com
2. Update sale status to "Completed"
3. Should use Gmail SMTP
4. Customer receives email from someone@gmail.com

### Test 3: Mixed Providers
1. Different sales persons with different email providers
2. Each should use their respective SMTP settings
3. All emails should work correctly

## Troubleshooting

### Common Issues

**"Email authentication failed"**
- Check the correct environment variable for the email provider
- Verify password/app password is correct
- Ensure 2FA app passwords are used where required

**"Email server connection failed"**
- Check internet connectivity
- Verify SMTP server settings
- Check if email provider blocks SMTP access

**"Sales person email not available"**
- Ensure sales person has email field filled in user profile
- Check user data in database

**"Customer email not available"**
- Ensure customer email field is filled in sale record
- Verify email format is valid

### Provider-Specific Issues

**Hostinger**
- Ensure email account exists in Hostinger panel
- Check if SMTP is enabled for the email account
- Verify password is correct

**Gmail**
- Must use App Password, not regular password
- 2FA must be enabled
- Check if "Less secure app access" is disabled (should be)

**Outlook**
- May need app password if 2FA enabled
- Check if account is not locked

## Security Best Practices

1. **Use App Passwords** where available (Gmail, Yahoo)
2. **Store passwords securely** in environment variables
3. **Enable 2FA** on email accounts
4. **Rotate passwords** regularly
5. **Monitor email logs** for suspicious activity

## Production Deployment

### Environment Variables Checklist
- [ ] HOSTINGER_EMAIL_PASS (primary)
- [ ] GMAIL_APP_PASS (if using Gmail)
- [ ] OUTLOOK_EMAIL_PASS (if using Outlook)
- [ ] YAHOO_EMAIL_PASS (if using Yahoo)
- [ ] EMAIL_PASS (fallback)

### Testing Checklist
- [ ] Test with Hostinger email (traincapetech.in)
- [ ] Test with different customer email providers
- [ ] Verify dynamic content is correct
- [ ] Check CC functionality
- [ ] Test error handling (invalid emails, etc.) 