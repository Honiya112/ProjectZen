import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: 'background.js',
      name: 'ProjectZen',
      fileName: () => 'background.js',
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => id.startsWith('chrome'),
      output: {
        format: 'es',
        dir: 'dist',
      },
    },
  },
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY || ''),
  },
});

