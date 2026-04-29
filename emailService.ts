
import nodemailer from 'nodemailer';

// Email configuration from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error('[Email] Connection verification failed:', error);
    console.log('[Email] Current Config:', {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || '587',
      user: process.env.EMAIL_USER ? '***' : 'MISSING',
      pass: process.env.EMAIL_PASS ? '***' : 'MISSING',
      secure: process.env.EMAIL_SECURE
    });
  } else {
    console.log('[Email] Server is ready to take our messages');
  }
});

const GOLD = '#D4AF37';
const BLACK = '#111111';
const WHITE = '#FFFFFF';

const commonStyles = `
  body { 
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
    background-color: ${BLACK}; 
    color: ${WHITE}; 
    margin: 0; 
    padding: 0; 
    font-size: 16px;
  }
  .container { 
    max-width: 600px; 
    margin: 0 auto; 
    padding: 40px; 
    border: 1px solid ${GOLD}; 
    background-color: ${BLACK};
  }
  .header { 
    text-align: center; 
    border-bottom: 2px solid ${GOLD}; 
    padding-bottom: 20px; 
    margin-bottom: 30px; 
  }
  .logo { 
    color: ${GOLD}; 
    font-size: 28px; 
    font-weight: bold; 
    text-transform: uppercase; 
    letter-spacing: 4px; 
  }
  h1, h2, h3 { 
    color: ${GOLD}; 
    margin-top: 0; 
  }
  .content { 
    line-height: 1.6; 
  }
  p, span, li {
    color: ${WHITE};
    font-size: 16px;
  }
  .footer { 
    text-align: center; 
    margin-top: 40px; 
    font-size: 12px; 
    color: ${WHITE}; 
    border-top: 1px solid ${GOLD}; 
    padding-top: 20px; 
  }
  .button { 
    display: inline-block; 
    padding: 12px 24px; 
    background-color: ${GOLD}; 
    color: ${BLACK}; 
    text-decoration: none; 
    font-weight: bold; 
    border-radius: 4px; 
    margin-top: 20px; 
  }
  .highlight { 
    color: ${GOLD}; 
    font-weight: bold; 
  }
  .details-box { 
    background-color: #1a1a1a; 
    border-left: 4px solid ${GOLD}; 
    padding: 20px; 
    margin: 20px 0; 
  }
`;

export async function sendCustomerReceipt(data: {
  to: string;
  customerName: string;
  vendorName: string;
  amount: number;
  bookingId: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2>Thank You, <span class="highlight">${data.customerName}</span>!</h2>
          <p>We are so excited to be part of your Simcha!</p>
          <p>Your booking has been successfully confirmed and paid for. We're excited to help you celebrate your special occasion.</p>
          
          <div class="details-box">
            <p><strong>Vendor:</strong> ${data.vendorName}</p>
            <p><strong>Total Amount Paid:</strong> <span class="highlight">$${data.amount.toLocaleString()}</span></p>
            <p><strong>Booking Reference:</strong> ${data.bookingId}</p>
          </div>
          
          <p>If you have any questions, please feel free to reach out to the vendor directly through our platform.</p>
          <p>Please reach out to us if you have any special requests for your event.</p>
          
          <a href="${process.env.APP_URL}/client-portal" class="button">View My Bookings</a>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send customer receipt to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Mazel Tov! Your Booking is Confirmed`,
      html,
    });
    console.log(`[Email] Customer receipt sent successfully. MessageId: ${info.messageId}`);
  } catch (error: any) {
    console.error(`[Email] Failed to send customer receipt:`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
  }
}

export async function sendVendorNotification(data: {
  to: string;
  vendorName: string;
  customerName: string;
  amount: number;
  vendorShare: number;
  commissionRate: number;
  bookingId: string;
  eventDate: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2>New Booking Confirmed!</h2>
          <p>Mazel Tov! You have a new confirmed booking on Simcha Booking.</p>
          <p>Hello <span class="highlight">${data.vendorName}</span>,</p>
          <p>You have a new confirmed booking from <span class="highlight">${data.customerName}</span>.</p>
          
          <div class="details-box">
            <p><strong>Event Date:</strong> ${data.eventDate}</p>
            <p><strong>Booking Reference:</strong> ${data.bookingId}</p>
          </div>

          <div class="details-box">
            <p><strong>Total Service Price:</strong> $${data.amount.toLocaleString()}</p>
            <p><strong>Platform Commission:</strong> ${data.commissionRate}%</p>
            <p><strong>Your Payout:</strong> <span class="highlight" style="font-size: 1.2em;">$${data.vendorShare.toLocaleString()}</span></p>
          </div>
          
          <p>A reminder that your share (after the ${data.commissionRate}% platform commission) has been automatically deposited to your connected Stripe account.</p>
          
          <p>We’re looking forward to another successful event with you!</p>

          <a href="${process.env.APP_URL}/vendor-portal" class="button">Go to Vendor Portal</a>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send vendor notification to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `New Simcha Alert! - Booking Confirmed for ${data.customerName}`,
      html,
    });
    console.log(`[Email] Vendor notification sent successfully. MessageId: ${info.messageId}`);
  } catch (error: any) {
    console.error(`[Email] Failed to send vendor notification:`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
  }
}

export async function sendBookingConfirmation(data: {
  to: string;
  clientName: string;
  eventName: string;
  vendorName: string;
  vendorCategory: string;
  date: string;
  priceStart: number;
  notes?: string;
  eventLocation?: string;
  eventTime?: string;
  selectedServices?: string[];
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2>Booking Request Received!</h2>
          <p>Hello <span class="highlight">${data.clientName}</span>,</p>
          <p>Your booking request for <span class="highlight">${data.vendorName}</span> has been received and is currently pending vendor approval.</p>
          
          <div class="details-box">
            <p><strong>Event:</strong> ${data.eventName}</p>
            <p><strong>Date:</strong> ${data.date}</p>
            <p><strong>Category:</strong> ${data.vendorCategory}</p>
            <p><strong>Estimated Price:</strong> $${data.priceStart.toLocaleString()}</p>
            ${data.eventLocation ? `<p><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
            ${data.eventTime ? `<p><strong>Time:</strong> ${data.eventTime}</p>` : ''}
          </div>
          
          ${data.notes ? `<p><strong>Your Notes:</strong> ${data.notes}</p>` : ''}
          
          <p>Once the vendor confirms your booking, you will receive a payment link to finalize the reservation.</p>
          
          <a href="${process.env.APP_URL}/client-portal" class="button">Track My Request</a>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send booking confirmation to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Booking Request Received: ${data.vendorName}`,
      html,
    });
    console.log(`[Email] Booking confirmation sent successfully. MessageId: ${info.messageId}`);
  } catch (error: any) {
    console.error(`[Email] Failed to send booking confirmation:`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
  }
}

export async function sendTestEmail(to: string) {
  const html = `
    <h1>Simcha Booking Test Email</h1>
    <p>This is a test email to verify your SMTP configuration.</p>
    <p>Sent at: ${new Date().toLocaleString()}</p>
  `;

  try {
    console.log(`[Email] Attempting to send TEST email to ${to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking Test" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Simcha Booking - SMTP Test",
      html,
    });
    console.log(`[Email] Test email sent successfully. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email] Test email FAILED:`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
    throw error;
  }
}

export async function sendAccountVerificationEmail(data: {
  to: string;
  userName: string;
  verificationLink: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2>Verify Your Account</h2>
          <p>Hello <span class="highlight">${data.userName}</span>,</p>
          <p>Welcome to Simcha Booking! We're excited to have you join our community.</p>
          <p>To get started, please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center;">
            <a href="${data.verificationLink}" class="button">Verify My Account</a>
          </div>
          
          <p>If you did not create an account on Simcha Booking, you can safely ignore this email.</p>
          
          <p>We look forward to helping you plan your next Simcha!</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send account verification email to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Verify Your Simcha Booking Account`,
      html,
    });
    console.log(`[Email] Account verification email sent successfully. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email] Failed to send account verification email:`, error);
    throw error;
  }
}

export async function sendPasswordResetEmail(data: {
  to: string;
  userName: string;
  resetLink: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2>Reset Your Password</h2>
          <p>Hello <span class="highlight">${data.userName}</span>,</p>
          <p>We received a request to reset your password for your Simcha Booking account.</p>
          <p>If you made this request, please click the button below to set a new password:</p>
          
          <div style="text-align: center;">
            <a href="${data.resetLink}" class="button">Reset My Password</a>
          </div>
          
          <p>If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          
          <p>This link will expire in 1 hour for your security.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send password reset email to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Reset Your Simcha Booking Password`,
      html,
    });
    console.log(`[Email] Password reset email sent successfully. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email] Failed to send password reset email:`, error);
    throw error;
  }
}

export async function sendWelcomeGuideEmail(data: {
  to: string;
  userName: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2 style="text-align: center;">Welcome to Your Simcha Journey!</h2>
          <p>Hello <span class="highlight">${data.userName}</span>,</p>
          <p>Mazel Tov on starting your planning journey! We're here to make every step as seamless as the celebration itself. Here is your quick guide to getting started.</p>
          
          <div class="details-box">
            <h3 style="color: ${GOLD}; margin-top: 0;">The Simcha Secret</h3>
            <p>The secret to a stress-free celebration is early booking. Always look for the <span class="highlight">'Verified'</span> badge on vendor profiles—this ensures they have passed our rigorous standards for excellence. Booking your favorites early is the best way to guarantee your perfect date.</p>
          </div>

          <div class="details-box">
            <h3 style="color: ${GOLD}; margin-top: 0;">Secure, Transparent Payments</h3>
            <p>We believe in total transparency. Every payment you make through Simcha Booking is secure and generates an <span class="highlight">instant digital receipt</span>. You can track your entire event budget and view all your documents in one place via the <span class="highlight">'My Portal'</span> dashboard.</p>
          </div>

          <div class="details-box">
            <h3 style="color: ${GOLD}; margin-top: 0;">The Milestone Method</h3>
            <p>Master your planning with the <span class="highlight">'Milestone Method.'</span> We recommend securing the 'Big Three'—Venue, Catering, and Music—first. Aim to have these confirmed at least 12 months out, and use the 6-month mark as your milestone to have all other professional partners finalized.</p>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${process.env.APP_URL}" class="button">Start Planning Now</a>
          </p>
          
          <p>We’re looking forward to helping you create an unforgettable Simcha!</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send welcome guide email to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Your Guide to Planning the Perfect Simcha`,
      html,
    });
    console.log(`[Email] Welcome guide email sent successfully. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email] Failed to send welcome guide email:`, error);
    throw error;
  }
}

export async function sendPreEventCheckInEmail(data: {
  to: string;
  userName: string;
  eventDate: string;
}) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Simcha Booking</div>
        </div>
        <div class="content">
          <h2 style="text-align: center;">Mazel Tov! One Week to Go!</h2>
          <p>Hello <span class="highlight">${data.userName}</span>,</p>
          <p>We noticed your big day is just one week away! We are so excited for you.</p>
          
          <div class="details-box">
            <p>If you need any last-minute help with your bookings or have any questions, just reply to this email. Our team is standing by to ensure your celebration is perfect.</p>
          </div>
          
          <p>We look forward to celebrating with you on <span class="highlight">${data.eventDate}</span>!</p>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="${process.env.APP_URL}/client-portal" class="button">View My Dashboard</a>
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Simcha Booking. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    console.log(`[Email] Attempting to send 7-day check-in email to ${data.to}...`);
    const info = await transporter.sendMail({
      from: `"Simcha Booking" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: `Mazel Tov! Only 7 days until your Simcha!`,
      html,
    });
    console.log(`[Email] 7-day check-in email sent successfully. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[Email] Failed to send 7-day check-in email:`, error);
    throw error;
  }
}
