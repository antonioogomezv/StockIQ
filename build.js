const fs = require('fs');

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
