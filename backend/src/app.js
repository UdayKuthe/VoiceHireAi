import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import recruiterRoutes from './routes/recruiterRoutes.js';
import candidateRoutes from './routes/candidateRoutes.js';
import interviewLiveRoutes from './routes/interviewLive.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Enable CORS for frontend development
app.use(
  cors({
    origin: true, // Allow frontend dev server
    credentials: true
  })
);

app.use(express.json());

// Request logging middleware for terminal visibility on EVERY API call
app.use((req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const timestamp = new Date().toLocaleTimeString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : status >= 300 ? '\x1b[36m' : '\x1b[32m';
    console.log(`[HTTP API] ${timestamp} | ${method.padEnd(6)} ${originalUrl.padEnd(35)} | Status: ${color}${status}\x1b[0m | Duration: ${duration}ms`);
  });

  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    phase: 'Phase 1 - Foundation',
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/interviews', interviewLiveRoutes);
app.use('/api', recruiterRoutes);

// Catch 404 for unmapped routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}. Route not found.`
  });
});

// Centralized error handling
app.use(errorHandler);

export default app;
