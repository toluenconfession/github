import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const candidates = [
  path.join(rootDir, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
  path.join(rootDir, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs'),
];

const publicDir = path.join(rootDir, 'public');
fs.mkdirSync(publicDir, { recursive: true });

for (const src of candidates) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(publicDir, 'pdf.worker.min.mjs'));
    console.log('[postinstall] Copied pdf.worker.min.mjs to public/');
    break;
  }
}
