require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initDb, getDb, closeDb } = require('./db');
const { scheduleBackups } = require('./backup');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

initDb();
scheduleBackups();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.use('/api/packages', require('./routes/packages'));
app.use('/api/files', require('./routes/files'));
app.use('/api/email', require('./routes/email'));
app.use('/api/nonpo', require('./routes/nonpo'));

app.get('/api/config', (req, res) => {
  res.json({ loic_email: process.env.LOIC_EMAIL || '' });
});

app.get('/api/health', (req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'YOUR-LOCAL-IP';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== Package Tracker ===');
  console.log(`Desktop: http://localhost:${PORT}`);
  console.log(`Phone:   http://${getLocalIP()}:${PORT}  (must be on same WiFi)\n`);
});

function shutdown(signal) {
  console.log(`\n[shutdown] received ${signal}, closing server...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });

  setTimeout(() => {
    closeDb();
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
