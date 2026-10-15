import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', setupFiles: './src/tests/setup.js', restoreMocks: true, pool: 'threads', maxWorkers: 1, minWorkers: 1 } });
