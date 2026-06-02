import fs from 'node:fs';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function escapeForHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const supabaseUrl = required('SUPABASE_URL');
const supabaseAnonKey = required('SUPABASE_ANON_KEY');
const assetBaseUrl =
  process.env.ASSET_BASE_URL ||
  `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/game-assets`;

const indexPath = new URL('../index.html', import.meta.url);
let html = fs.readFileSync(indexPath, 'utf8');

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

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[inject-env] OK: injected SUPABASE_URL, SUPABASE_ANON_KEY, ASSET_BASE_URL');

