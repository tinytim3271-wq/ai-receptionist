import 'dotenv/config';
import path from 'node:path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredSecret(name: string): string {
  const value = required(name);
  const insecureDefaults = new Set(['local-dev-token-change-me', 'change-me', 'changeme']);
  if (insecureDefaults.has(value.trim().toLowerCase())) {
    throw new Error(`Environment variable ${name} must be changed from the default placeholder value.`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: path.join(__dirname, '..', 'data', 'receptionist.db'),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  apiBearerToken: requiredSecret('AI_API_BEARER_TOKEN'),
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  shopName: required('SHOP_NAME', 'Reliable Shop Systems'),
  shopAddress: required('SHOP_ADDRESS', '123 Main St'),
  mobileRadiusMiles: Number(process.env.MOBILE_RADIUS_MILES ?? 25),
  diagnosticFeePolicy: process.env.DIAGNOSTIC_FEE_POLICY ?? 'Standard diagnostic fee applies.',
  paymentMethods: process.env.PAYMENT_METHODS ?? 'Cash and card.',
  afterHoursPolicy: process.env.AFTER_HOURS_POLICY ?? 'Leave a message, we will call back.',
};
