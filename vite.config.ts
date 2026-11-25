import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 41732,
    strictPort: true,
    watch: { ignored: ['**/.runtime/**', '**/release/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.runtime/**', '**/release/**', '**/*.sqlite3*'] },
  },
});
