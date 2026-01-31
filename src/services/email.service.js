import nodemailer from 'nodemailer';

// Create email transporter (using port 587 with STARTTLS - more reliable)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
  // Add timeout to prevent long waits in production
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

/**
 * Generate 6-digit OTP
 */
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP email
 */
export async function sendOTPEmail(email, otp, name = 'User') {
  try {
    const mailOptions = {
      from: `"Spot Samachar" <${process.env.EMAIL_USER}>`,
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
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email after successful signup
 */
export async function sendWelcomeEmail(email, name) {
  try {
    const mailOptions = {
      from: `"Spot Samachar" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Spot Samachar!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
            .container { background: white; max-width: 600px; margin: 0 auto; padding: 30px; border-radius: 10px; }
            .header { text-align: center; color: #144bb8; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Spot Samachar!</h1>
            </div>
            <p>Hello ${name},</p>
            <p>Thank you for joining Spot Samachar. You can now report incidents in your area and help make your community safer.</p>
            <p>Get started by reporting your first incident!</p>
            <p>Best regards,<br/>The Spot Samachar Team</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Welcome email error:', error);
  }
}
