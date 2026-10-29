/**
 * env.ts — Validate and export required environment variables at startup.
 * This makes missing config crash early with a clear message instead of
 * failing silently later at runtime.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
  SMTP_HOST: process.env.SMTP_HOST?.trim() || undefined,
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  SMTP_USER: process.env.SMTP_USER?.trim() || undefined,
  SMTP_PASS: process.env.SMTP_PASS || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM?.trim() || undefined,
  APP_BASE_URL: process.env.APP_BASE_URL?.trim().replace(/\/$/, '') || undefined,
} as const;

if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
