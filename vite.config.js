import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Use resolve with the new __dirname
        content: resolve(__dirname, 'src/index.js'),
        background: resolve(__dirname, 'background.js'),
        popup: resolve(__dirname, 'popup/popup.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'config.json', dest: '.' },
        { src: 'styles', dest: '.' }, 
        { src: 'lib', dest: '.' },
        { src: 'public/index.html', dest: '.' }
      ]
    })
  ]
});
