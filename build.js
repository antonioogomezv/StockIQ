const fs = require('fs');

const finnhub   = process.env.FINNHUB_KEY   || '';
const polygon   = process.env.POLYGON_KEY   || '';
const anthropic = process.env.ANTHROPIC_KEY || '';

console.log('Building config.js...');
console.log('FINNHUB_KEY present:', finnhub.length > 0);
console.log('POLYGON_KEY present:', polygon.length > 0);
console.log('ANTHROPIC_KEY present:', anthropic.length > 0);

const content = `window.FINNHUB_KEY   = "${finnhub}";
window.POLYGON_KEY   = "${polygon}";
window.ANTHROPIC_KEY = "${anthropic}";
`;

fs.writeFileSync('config.js', content);
console.log('config.js generated successfully.');
