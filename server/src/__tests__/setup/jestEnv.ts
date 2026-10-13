/**
 * jestEnv.ts — Loaded before each test file via jest.config.json `setupFiles`.
 * Ensures .env is loaded into process.env for all tests.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
