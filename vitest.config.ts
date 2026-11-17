import { defineConfig } from 'vitest/config';

// Unit tests live in tests/. The end-to-end tests in e2e/ are run by Playwright, not Vitest.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
