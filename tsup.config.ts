import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['app.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
});
