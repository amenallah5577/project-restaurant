// server.js — Project Restaurant API
require('dotenv').config();
const path      = require('path');
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
}));

app.use('/api/reservations', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Too many requests. Please slow down.' }
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/menu',         require('./routes/menu'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Project Restaurant API', timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, 'admin'), { index: false }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'website.html'));
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Boot: init DB first, then start server ───────────────────────────────────
const { init } = require('./db');
const PORT = parseInt(process.env.PORT) || 3000;

if (require.main === module) init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🌸 Project Restaurant API running at http://localhost:${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health`);
    console.log(`   Website: http://localhost:${PORT}`);
    console.log(`   Admin:   http://localhost:${PORT}/index.html\n`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;
