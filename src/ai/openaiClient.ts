import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | undefined;

export function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}
