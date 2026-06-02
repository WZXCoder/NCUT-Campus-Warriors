import fs from 'node:fs';
import path from 'node:path';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function escapeForHtmlAttr(value) {
  return String(value)
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');
}

const supabaseUrl = required('SUPABASE_URL');
const supabaseAnonKey = required('SUPABASE_ANON_KEY');
const assetBaseUrl =
  process.env.ASSET_BASE_URL ||
  `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/game-assets`;

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const templatePath = path.join(rootDir, 'index.html');
let html = fs.readFileSync(templatePath, 'utf8');

const replacements = {
  __SUPABASE_URL__: escapeForHtmlAttr(supabaseUrl),
  __SUPABASE_ANON_KEY__: escapeForHtmlAttr(supabaseAnonKey),
  __ASSET_BASE_URL__: escapeForHtmlAttr(assetBaseUrl),
};

for (const [key, value] of Object.entries(replacements)) {
  if (!html.includes(key)) {
    throw new Error(`Placeholder not found in index.html: ${key}`);
  }
  html = html.split(key).join(value);
}

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const distDir = path.join(rootDir, 'dist');
rmrf(distDir);
fs.mkdirSync(distDir, { recursive: true });

fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf8');
copyRecursive(path.join(rootDir, 'js'), path.join(distDir, 'js'));
copyRecursive(path.join(rootDir, 'images'), path.join(distDir, 'images'));
copyRecursive(path.join(rootDir, 'style.css'), path.join(distDir, 'style.css'));
copyRecursive(path.join(rootDir, 'main.js'), path.join(distDir, 'main.js'));
copyRecursive(path.join(rootDir, 'manifest.webmanifest'), path.join(distDir, 'manifest.webmanifest'));

console.log('[inject-env] OK: wrote dist/ with injected config');

