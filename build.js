const fs = require('fs');
const { minify } = require('terser');

// Keys are now server-side only (netlify/functions) — config.js is empty
console.log('Building config.js (keys are server-side now)...');
fs.writeFileSync('config.js', `// API calls are proxied through Netlify functions — no keys in browser.\n`);
console.log('config.js generated successfully.');

// Update sw.js cache version with timestamp so users always get latest
const version = 'stockiq-' + Date.now();
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/const CACHE = "stockiq-[^"]+";/, `const CACHE = "${version}";`);
fs.writeFileSync('sw.js', sw);
console.log('sw.js cache version updated to:', version);

// Minify script.js in-place
(async () => {
  console.log('Minifying script.js...');
  const code = fs.readFileSync('script.js', 'utf8');
  const result = await minify(code, { compress: true, mangle: true });
  if (result.code) {
    fs.writeFileSync('script.js', result.code);
    const before = Buffer.byteLength(code, 'utf8');
    const after = Buffer.byteLength(result.code, 'utf8');
    console.log(`script.js minified: ${(before/1024).toFixed(1)}KB → ${(after/1024).toFixed(1)}KB`);
  } else {
    console.error('Minification failed:', result.error);
    process.exit(1);
  }
})();
