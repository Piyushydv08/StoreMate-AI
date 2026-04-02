require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const messageHandler = require('./webhook/messageHandler');
const { initScheduler } = require('./services/schedulerService');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── Request Logging Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  const methodColors = {
    GET: '\x1b[36m',    // Cyan
    POST: '\x1b[32m',   // Green
    PUT: '\x1b[33m',    // Yellow
    DELETE: '\x1b[31m', // Red
    PATCH: '\x1b[35m'   // Magenta
  };
  const color = methodColors[req.method] || '\x1b[37m';
  const reset = '\x1b[0m';
  
  // Log incoming request
  console.log(`\n${color}→ ${req.method.padEnd(6)}${reset} ${req.path}`);
  if (req.ip) console.log(`  📍 IP: ${req.ip}`);
  
  // Log incoming body for POST/PUT requests
  if ((req.method === 'POST' || req.method === 'PUT') && Object.keys(req.body).length > 0) {
    const bodyStr = JSON.stringify(req.body);
    const preview = bodyStr.substring(0, 200) + (bodyStr.length > 200 ? '...' : '');
    console.log(`  📦 Body: ${preview}`);
  }
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : res.statusCode >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${statusColor}✓ ${res.statusCode}${reset} ${req.path} (${duration}ms)`);
  });
  
  next();
});

// ─── Database ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    initScheduler();
    console.log('✅ Scheduler started');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ─── Webhook (Twilio posts here) ─────────────────────────────────────────────
app.use('/webhook', (req, res, next) => {
  console.log('\n🔔 ─────────────────────────────────────────────────────────────────');
  console.log('🔔 WEBHOOK MESSAGE RECEIVED FROM TWILIO');
  console.log('   📱 From:', req.body?.From || 'Unknown');
  console.log('   💬 Message:', req.body?.Body || 'No body');
  console.log('   🆔 MessageSid:', req.body?.MessageSid || 'N/A');
  console.log('🔔 ─────────────────────────────────────────────────────────────────\n');
  next();
}, messageHandler);

// ─── REST API ─────────────────────────────────────────────────────────────────
const inventoryRoutes = require('./api/inventoryRoutes');
app.use('/api', inventoryRoutes);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    app: 'StoreMate AI',
    status: 'running',
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      api: '/api'
    }
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 StoreMate AI running on port ${PORT}`));
