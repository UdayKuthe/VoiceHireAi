import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import recruiterRoutes from './routes/recruiterRoutes.js';
import candidateRoutes from './routes/candidateRoutes.js';
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
