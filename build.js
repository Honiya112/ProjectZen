import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file
const envConfig = dotenv.config({ path: path.join(__dirname, '.env') });
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || '';

console.log(`[Build] VITE_GEMINI_API_KEY: ${GEMINI_API_KEY ? '✓ Set (' + GEMINI_API_KEY.substring(0, 10) + '...)' : '✗ Not set'}`);

// Directory to copy from and to
const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');

// Files to copy (exclude node_modules, .env, build artifacts)
const excludePatterns = ['node_modules', '.env', '.git', 'dist', 'vite.config.js', 'build.js', 'package-lock.json', '.DS_Store'];

function isExcluded(filePath) {
  const relativePath = path.relative(srcDir, filePath);
  return excludePatterns.some(pattern => relativePath.includes(pattern) || relativePath.startsWith(pattern));
}

// Recursive copy with processing
function copyFiles(dir, outDir) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const srcPath = path.join(dir, file);
    const outPath = path.join(outDir, file);

    if (isExcluded(srcPath)) {
      return;
    }

    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyFiles(srcPath, outPath);
    } else if (stat.isFile()) {
      // If it's a JS file, process the content to replace env variables
      if (file.endsWith('.js')) {
        let content = fs.readFileSync(srcPath, 'utf-8');
        
        // Replace import.meta.env.VITE_GEMINI_API_KEY with actual value
        content = content.replace(
          /import\.meta\.env\.VITE_GEMINI_API_KEY/g,
          `'${GEMINI_API_KEY}'`
        );

        fs.writeFileSync(outPath, content, 'utf-8');
        console.log(`[Build] ✓ Processed: ${path.relative(srcDir, srcPath)}`);
      } else if (file === 'config.json') {
        // Always copy config.json (it's needed at runtime)
        fs.copyFileSync(srcPath, outPath);
        console.log(`[Build] ✓ Copied: ${path.relative(srcDir, srcPath)}`);
      } else {
        // Copy other files as-is
        fs.copyFileSync(srcPath, outPath);
        console.log(`[Build] ✓ Copied: ${path.relative(srcDir, srcPath)}`);
      }
    }
  });
}

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
  console.log('[Build] ✓ Cleaned dist directory');
}

// Start copying
console.log('[Build] Starting build...');
copyFiles(srcDir, distDir);

console.log(`[Build] ✓ Build complete! Output in: ${distDir}`);
console.log('[Build] Load the dist/ folder as an unpacked extension in Chrome.');
