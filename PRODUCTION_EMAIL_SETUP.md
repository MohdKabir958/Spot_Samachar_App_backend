# Production Email Setup Guide

## Problem
Gmail is unreliable for production apps because:
- Gmail blocks/throttles emails from cloud hosting IPs
- Rate limits are strict for apps
- Takes 20-60 seconds to send emails (timeouts)
- Not designed for transactional emails

## Solution: Use Resend (Recommended)

### Why Resend?
✅ 3,000 emails/month FREE
✅ Fast delivery (< 1 second)
✅ Simple API
✅ Great deliverability
✅ Developer-friendly

### Setup Steps

#### 1. Install Resend
```bash
npm install resend
```

#### 2. Get API Key
1. Go to https://resend.com/signup
2. Create account
3. Get API key from dashboard
4. Add to `.env`:
```env
RESEND_API_KEY=re_123456789
```

#### 3. Update email.service.js

Replace the Gmail transporter with Resend:

```javascript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOTPEmail(email, otp, name = 'User') {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Spot Samachar <onboarding@resend.dev>', // Use your domain later
      to: email,
      subject: 'Your Spot Samachar Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
            .container { background: white; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { text-align: center; color: #144bb8; margin-bottom: 30px; }
            .otp-box { background: #f0f7ff; border: 2px solid #144bb8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #144bb8; letter-spacing: 5px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Spot Samachar</h1>
            </div>
            <p>Hello ${name},</p>
            <p>Your One-Time Password (OTP) for Spot Samachar is:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p>This OTP will expire in <strong>5 minutes</strong>.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            <div class="footer">
              <p>© 2024 Spot Samachar. All rights reserved.</p>
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log('OTP email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}
```

#### 4. Update .env.example
```env
# Email Configuration - Resend
RESEND_API_KEY=your-resend-api-key

# Old Gmail (for reference - remove in production)
# EMAIL_USER=your-email@gmail.com
# EMAIL_APP_PASSWORD=your-16-character-app-password
```

#### 5. Deploy to Render
1. Add `RESEND_API_KEY` environment variable in Render dashboard
2. Redeploy your app
3. Test the `/api/auth/send-otp` endpoint

## Alternative: SendGrid

If you prefer SendGrid:

### Install
```bash
npm install @sendgrid/mail
```

### Usage
```javascript
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendOTPEmail(email, otp, name = 'User') {
  try {
    await sgMail.send({
      to: email,
      from: 'noreply@spotsamachar.com', // Use verified sender
      subject: 'Your Spot Samachar Verification Code',
      html: /* your HTML */,
    });
    
    return { success: true };
  } catch (error) {
    console.error('SendGrid error:', error);
    return { success: false, error: error.message };
  }
}
```

## Testing Locally

After implementing Resend:
1. Get test API key from Resend
2. Add to `.env`
3. Test locally with Postman:
   ```json
   POST http://localhost:3000/api/auth/send-otp
   {
     "email": "test@example.com"
   }
   ```
4. Response should be instant (< 1 second)!

## Summary

**Current State:**
- ✅ Gmail works locally
- ❌ Gmail slow/blocked on Render (30-60s delay)

**After Fix:**
- ✅ Instant API response (email sent in background)
- ✅ 10-second timeout (if still using Gmail)
- 🎯 **Best:** Switch to Resend for instant, reliable delivery
