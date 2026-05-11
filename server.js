require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

initDb();

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

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'YOUR-LOCAL-IP';
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== Package Tracker ===');
  console.log(`Desktop: http://localhost:${PORT}`);
  console.log(`Phone:   http://${getLocalIP()}:${PORT}  (must be on same WiFi)\n`);
});
