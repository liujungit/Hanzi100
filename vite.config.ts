import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: ['safari16', 'chrome108'] },
  server: { port: 5173, strictPort: true },
});
