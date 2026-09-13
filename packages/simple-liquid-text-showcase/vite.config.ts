import {defineConfig} from 'vite';

export default defineConfig({
  // Preserve both backdrop-filter declarations. The default CSS optimizer drops
  // the unprefixed property, leaving Chromium with no text refraction in production.
  build: {cssMinify: false},
});
