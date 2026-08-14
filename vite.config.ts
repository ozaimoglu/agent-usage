import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['../../tests/**/*.test.{ts,tsx}'],
    setupFiles: ['../../tests/setup.ts'],
  },
});
