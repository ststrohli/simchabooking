import express from 'express';
import admin from 'firebase-admin';

// This prevents the "App already exists" crash
if (!admin.apps.length) {
  try {
    admin.initializeApp();
    console.log("✅ Firebase Admin Connected");
  } catch (err) {
    console.error("❌ Firebase Init Error:", err);
  }
}

const app = express();
// Use the Cloud Port and the 0.0.0.0 address
const PORT = process.env.PORT || 8080;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 SERVER LIVE ON PORT ${PORT}`);
});

// This catches any remaining "hidden" errors
process.on('uncaughtException', (err) => {
  console.error('🔥 LATE STARTUP ERROR:', err);
});
