import 'dotenv/config';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  aiServiceUrl: string;
  githubToken?: string;
  githubWebhookSecret?: string;
  encryptionKey: string;
  logLevel: string;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgresql://codesentinel:codesentinel@localhost:5432/codesentinel'),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me-in-production-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  githubToken: process.env.GITHUB_TOKEN,
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  // 32-byte key (hex) used for AES-256-GCM encryption of stored GitHub tokens
  encryptionKey: required('ENCRYPTION_KEY', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
