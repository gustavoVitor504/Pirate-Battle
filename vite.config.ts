import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Keep bundled chunks apart from the static game assets served under /assets.
  build: { assetsDir: 'bundle' },
});
