import express from 'express';
import path from 'node:path';
import { config } from './config';
import './db';
import { seedBusinessRules } from './db/seed';
import { aiRouter } from './routes/ai';
import { chatRouter } from './routes/chat';
import { telephonyRouter } from './routes/telephony';

seedBusinessRules();

const app = express();
app.use(express.json());

app.use('/api/ai', aiRouter);
app.use('/api/chat', chatRouter);
app.use('/api/telephony', telephonyRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Bind to localhost only: nothing is exposed beyond this machine.
app.listen(config.port, '127.0.0.1', () => {
  console.log(`AI receptionist running at http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  if (!config.openaiApiKey) {
    console.warn('WARNING: OPENAI_API_KEY is not set. The chat will not work until you add it to .env');
  }
});
