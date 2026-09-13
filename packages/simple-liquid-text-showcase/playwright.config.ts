import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',
  use:{baseURL:'http://127.0.0.1:4190',viewport:{width:1280,height:900},browserName:'chromium'},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4190 --strictPort',url:'http://127.0.0.1:4190',reuseExistingServer:false},
});
