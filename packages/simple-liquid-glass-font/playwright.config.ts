import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4186', viewport: { width: 1100, height: 950 } },
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({ name: browserName, use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' } })),
  webServer: { command: 'npm run dev -- --strictPort', url: 'http://127.0.0.1:4186', reuseExistingServer: !process.env.CI }
});
