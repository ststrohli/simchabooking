import express from 'express';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

app.get('/', (req, res) => {
  res.send('The Failsafe Server is LIVE! 🟢');
});

// A simple error catcher to prevent instant crashes
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Failsafe is running on port ${PORT}`);
});
