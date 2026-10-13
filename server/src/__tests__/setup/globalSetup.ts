import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * globalSetup — runs once before all test suites.
 * Loads .env so DATABASE_URL and other env vars are available.
 */
export default async function globalSetup() {
  // Load the server's .env file (same one used in dev)
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  process.env.NODE_ENV = 'test';
}
