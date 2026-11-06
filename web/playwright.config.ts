import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'var/e2e-results.json' }]],
  use: { baseURL: 'http://localhost:3103', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  outputDir: 'var/e2e-artifacts',
  webServer: {
    command: 'node --import=tsx scripts/e2e-server.ts',
    url: 'http://localhost:3103/api/gate',
    reuseExistingServer: false,
    timeout: 90_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
