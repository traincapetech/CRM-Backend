# 📧 Hostinger Email Configuration for CRM System
## Using crm@traincapetech.in

---

## 🔧 SMTP Configuration Details

### **For Nodemailer (Backend - Currently Configured)**

```javascript
Host: smtp.hostinger.com
Port: 587 (RECOMMENDED - STARTTLS)
Alternative Port: 465 (SSL/TLS)
Encryption: STARTTLS (for port 587) or SSL/TLS (for port 465)
Authentication: Required
Username: crm@traincapetech.in
Password: [Your Hostinger email password]
```

### **Connection Settings**
- **Secure**: `false` for port 587 (uses STARTTLS)
- **Secure**: `true` for port 465 (uses SSL/TLS)
- **Require TLS**: `true`
- **Connection Timeout**: 30 seconds
- **Socket Timeout**: 30 seconds

---

## 🌐 IMAP Configuration (For Reading Emails)

If you need to read incoming emails:

```
IMAP Host: imap.hostinger.com
IMAP Port: 993
Encryption: SSL/TLS
Username: crm@traincapetech.in
Password: [Your Hostinger email password]
```

---

## 📥 POP3 Configuration (Alternative to IMAP)

```
POP3 Host: pop.hostinger.com
POP3 Port: 995
Encryption: SSL/TLS
Username: crm@traincapetech.in
Password: [Your Hostinger email password]
```

---

## ⚙️ Environment Variables Setup

### **For Your Server (.env file)**

Add these variables to your `/server/.env` file:

```bash
# Email Configuration for Forgot Password & Notifications
EMAIL_USER=crm@traincapetech.in
EMAIL_PASS=your_email_password_here

# Alternative variable names (if needed)
HOSTINGER_EMAIL_USER=crm@traincapetech.in
HOSTINGER_EMAIL_PASS=your_email_password_here
```

### **For Render.com Deployment**

Add these environment variables in your Render dashboard:

1. Go to your Render service
2. Navigate to "Environment" tab
3. Add the following:

```
EMAIL_USER=crm@traincapetech.in
EMAIL_PASS=your_email_password_here
```

---

## 📧 Email Features Currently Using This Configuration

### 1. **Forgot Password (OTP)**
- File: `server/controllers/auth.js` → `forgotPassword` function
- Sends 6-digit OTP to user's email
- OTP expires in 10 minutes
- Email template includes professional branding

### 2. **Payment Confirmation Emails**
- File: `server/services/emailService.js`
- Sent when token payment is received
- Includes payment details and pending amount
- CC's the sales person

### 3. **Service Delivery Confirmation**
- File: `server/services/emailService.js`
- Sent when service is fully delivered
- Confirms full payment receipt
- Professional branded template

### 4. **Lead Reminders** (If Enabled)
- File: `server/utils/reminderService.js`
- Sends reminders for lead follow-ups
- Automated scheduling

---

## 🔐 Security Best Practices

### **Password Management**
1. **Use App Password** (if available in Hostinger)
   - Log in to Hostinger webmail
   - Go to Settings → Security
   - Generate App Password for "Mail Client"
   - Use this instead of your main password

2. **Never commit `.env` to Git**
   - Already added to `.gitignore`
   - Use secure environment variable storage on Render

3. **Rotate Passwords Regularly**
   - Change email password every 90 days
   - Update environment variables accordingly

---

## 🧪 Testing Email Configuration

### **Test Script**

Create a test file: `server/test-email.js`

```javascript
require('dotenv').config();
const { sendEmail } = require('./config/nodemailer');

async function testEmail() {
  try {
    console.log('Testing email with:', {
      user: process.env.EMAIL_USER,
      host: 'smtp.hostinger.com',
      port: 587
    });

    await sendEmail(
      'your-test-email@example.com',
      'Test Email from CRM System',
      'This is a test email to verify SMTP configuration.',
      '<h1>Test Email</h1><p>This is a test email to verify SMTP configuration.</p>'
    );

    console.log('✅ Email sent successfully!');
  } catch (error) {
    console.error('❌ Email test failed:', error);
  }
}

testEmail();
```

### **Run Test:**
```bash
cd /Users/a/Desktop/Traincape_CRM-main/server
node test-email.js
```

---

## 🚨 Troubleshooting Common Issues

### **Issue 1: Authentication Failed (EAUTH)**
**Solutions:**
- Verify email and password are correct
- Check if email account is active in Hostinger
- Try generating an App Password
- Ensure no extra spaces in `.env` values

### **Issue 2: Connection Timeout (ETIMEDOUT)**
**Solutions:**
- Check firewall settings (especially on Render)
- Verify Hostinger SMTP service is running
- Try alternative port (465 instead of 587)
- Check if your hosting provider blocks SMTP ports

### **Issue 3: Connection Refused (ECONNREFUSED)**
**Solutions:**
- Verify correct SMTP host: `smtp.hostinger.com`
- Check DNS resolution
- Ensure port 587 or 465 is not blocked
- Try from different network

### **Issue 4: SSL/TLS Errors**
**Solutions:**
- For port 587: Use `secure: false` with `requireTLS: true`
- For port 465: Use `secure: true`
- Set `tls: { rejectUnauthorized: false }` if self-signed cert issues

---

## 📱 Mobile Email Client Settings

If you want to access crm@traincapetech.in on your phone:

### **Gmail App (Android/iOS):**
1. Open Gmail → Settings → Add Account → Other
2. Enter: crm@traincapetech.in
3. Choose "Personal (IMAP)"
4. Incoming: imap.hostinger.com, Port 993, SSL
5. Outgoing: smtp.hostinger.com, Port 587, STARTTLS

### **iPhone Mail App:**
1. Settings → Mail → Accounts → Add Account → Other
2. Add Mail Account: crm@traincapetech.in
3. IMAP Settings:
   - Host: imap.hostinger.com
   - Port: 993
   - SSL: On
4. SMTP Settings:
   - Host: smtp.hostinger.com
   - Port: 587
   - STARTTLS: On

---

## 🔄 Migration from sales@traincapetech.in

If you were previously using `sales@traincapetech.in`:

### **Changes Made:**
1. ✅ Updated `server/config/nodemailer.js` default email
2. ✅ Updated email display name to "Traincape CRM"
3. ✅ Updated environment variable references

### **What You Need to Do:**
1. Update `.env` file with new credentials
2. Update Render environment variables
3. Test forgot password functionality
4. Verify payment confirmation emails
5. Check email logs for any errors

---

## 📊 Email Templates

### **Forgot Password OTP Template:**
```html
<h2>Password Reset OTP</h2>
<p>Your OTP for password reset is: <strong>[OTP]</strong></p>
<p>This OTP will expire in 10 minutes.</p>
<p>If you did not request this password reset, please ignore this email.</p>
```

### **Customize Email Templates:**
- Located in: `server/controllers/auth.js` (lines 1261-1266)
- Can be modified with your branding
- Support HTML formatting

---

## 🎯 Next Steps

1. **Update Environment Variables:**
   ```bash
   cd /Users/a/Desktop/Traincape_CRM-main/server
   nano .env
   # Add: EMAIL_USER=crm@traincapetech.in
   # Add: EMAIL_PASS=your_password
   ```

2. **Test Locally:**
   ```bash
   node test-email.js
   ```

3. **Update Render:**
   - Log in to Render dashboard
   - Go to your CRM backend service
   - Environment → Add EMAIL_USER and EMAIL_PASS

4. **Test Forgot Password:**
   - Go to your CRM frontend
   - Click "Forgot Password"
   - Enter a test email
   - Check if OTP arrives

5. **Monitor Logs:**
   ```bash
   # On Render
   Check Logs tab for email sending status
   
   # Locally
   Check server console output
   ```

---

## 📞 Support Contacts

### **Hostinger Support:**
- **Email:** support@hostinger.com
- **Live Chat:** Available in Hostinger panel
- **Documentation:** https://www.hostinger.com/tutorials/email

### **Common Questions to Ask Hostinger:**
1. "Is SMTP enabled for crm@traincapetech.in?"
2. "What are the SMTP rate limits?"
3. "Can I generate an App Password for SMTP?"
4. "Are there any IP restrictions on SMTP?"

---

## 📈 Email Sending Limits

Hostinger email accounts typically have sending limits:

- **Free/Basic Plans:** ~100 emails/hour
- **Business Plans:** ~500 emails/hour
- **Enterprise Plans:** Custom limits

**Check your limit:**
1. Log in to Hostinger control panel
2. Go to Email → Email Accounts
3. Check quota/limits for crm@traincapetech.in

**If you exceed limits:**
- Implement email queuing
- Space out bulk emails
- Consider transactional email service (SendGrid, AWS SES)

---

## ✅ Configuration Checklist

- [x] Backend updated to use `crm@traincapetech.in`
- [ ] `.env` file updated with EMAIL_USER and EMAIL_PASS
- [ ] Render environment variables updated
- [ ] Test email script run successfully
- [ ] Forgot password tested on frontend
- [ ] Payment confirmation emails tested
- [ ] Email templates customized (optional)
- [ ] Email sending limits verified with Hostinger
- [ ] Mobile email client configured (optional)
- [ ] Team members notified of new email address

---

## 🎉 All Done!

Your CRM is now configured to send emails from **crm@traincapetech.in** using Hostinger's SMTP server.

**Important Files Modified:**
- ✅ `server/config/nodemailer.js` - Updated default email
- ✅ Email templates use "Traincape CRM" as sender name

**Remember to:**
1. Keep your email password secure
2. Never commit `.env` to version control
3. Monitor email logs for delivery issues
4. Test thoroughly before going to production

---

**Last Updated:** December 30, 2025
**Email:** crm@traincapetech.in
**SMTP Host:** smtp.hostinger.com
**SMTP Port:** 587 (STARTTLS) or 465 (SSL)

