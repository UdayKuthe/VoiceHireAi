import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

const startServer = async () => {
  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`[VoiceHire AI Backend] Running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    console.log(`[VoiceHire AI Backend] Health check: http://localhost:${env.PORT}/api/health`);
  });
};

startServer().catch((err) => {
  console.error('[Server Error] Startup failed:', err);
  process.exit(1);
});
