// Load .env before any module reads process.env.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const treatyRoutes = require('./routes/treaties');
const dashboardRoutes = require('./routes/dashboard');
const cedentRoutes = require('./routes/cedents');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// The frontend dev server proxies /api, so CORS only matters if a browser calls :5000 directly.
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/treaties', treatyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cedents', cedentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Nexus API is running' });
});

// Unknown routes and errors use the same { success, message } shape as the routes.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Express 5 forwards errors thrown in async handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  // `expose` marks client errors such as malformed JSON; never send internal error details.
  res.status(err.status || 500).json({
    success: false,
    message: err.expose ? err.message : 'Internal server error',
  });
});

// Listen only when run directly (npm start / npm run dev); test.js requires the app and listens itself.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('✅ Server starting...');
    console.log(`🚀 Nexus server running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
