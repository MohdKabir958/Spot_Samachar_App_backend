# 🚀 Quick Setup - Get Resend API Key

## Step 1: Create Resend Account
1. Go to https://resend.com/signup
2. Sign up with your email
3. Verify your email

## Step 2: Get API Key
1. Once logged in, go to **API Keys** section
2. Click **Create API Key**
3. Name it: `Spot Samachar Production`
4. Copy the API key (starts with `re_...`)

## Step 3: Add to Render
1. Go to your Render dashboard: https://dashboard.render.com
2. Click on your **spot-samachar-app-backend** service
3. Click **Environment** in the left sidebar
4. Click **Add Environment Variable**
5. Add:
   - **Key**: `RESEND_API_KEY`
   - **Value**: `re_your_copied_api_key_here`
6. Click **Save Changes**
7. Your service will automatically redeploy

## Step 4: Test
After deployment completes (1-2 minutes):

```bash
POST https://spot-samachar-app-backend.onrender.com/api/auth/send-otp
Content-Type: application/json

{
  "email": "your-test-email@gmail.com"
}
```

✅ You should receive the OTP email **instantly** (< 1 second)!

---

## Free Tier Limits
- **3,000 emails/month** for FREE
- Perfect for testing and small production apps
- Upgrade to paid if needed later

## Notes
- Resend gives you `onboarding@resend.dev` sender for free
- To use your own domain (e.g., `noreply@spotsamachar.com`), you need to:
  1. Add your domain in Resend dashboard
  2. Verify DNS records
  3. Update `from` field in `email.service.js`

## Local Development
Your local environment will continue using Gmail (nodemailer) as before. No changes needed locally.
