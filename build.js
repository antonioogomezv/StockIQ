const fs = require('fs');

// Generate config.js from env vars
const finnhub      = process.env.FINNHUB_KEY      || '';
const polygon      = process.env.POLYGON_KEY      || '';
const anthropic    = process.env.ANTHROPIC_KEY    || '';
const databursatil = process.env.DATABURSATIL_KEY || '';

console.log('Building config.js...');
console.log('FINNHUB_KEY present:',      finnhub.length > 0);
console.log('POLYGON_KEY present:',      polygon.length > 0);
console.log('ANTHROPIC_KEY present:',    anthropic.length > 0);
console.log('DATABURSATIL_KEY present:', databursatil.length > 0);

fs.writeFileSync('config.js', `window.FINNHUB_KEY      = "${finnhub}";
window.POLYGON_KEY      = "${polygon}";
window.ANTHROPIC_KEY    = "${anthropic}";
window.DATABURSATIL_KEY = "${databursatil}";
`);
console.log('config.js generated successfully.');

// Update sw.js cache version with timestamp so users always get latest
const version = 'stockiq-' + Date.now();
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/const CACHE = "stockiq-[^"]+";/, `const CACHE = "${version}";`);
fs.writeFileSync('sw.js', sw);
console.log('sw.js cache version updated to:', version);
