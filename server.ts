import express from 'express';
// ... import your other stuff here (firebase, etc)

const app = express();
const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    // MOVE ALL YOUR FIREBASE/GEMINI INIT CODE INSIDE HERE
    console.log("✅ Services initialized");
  } catch (err) {
    console.error("❌ CRASH PREVENTED:", err);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server heart is beating on ${PORT}`);
  });
}

startServer();
