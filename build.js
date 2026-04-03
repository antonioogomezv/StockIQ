const fs = require('fs');

const content = `window.FINNHUB_KEY   = "${process.env.FINNHUB_KEY || ''}";
window.POLYGON_KEY   = "${process.env.POLYGON_KEY || ''}";
window.ANTHROPIC_KEY = "${process.env.ANTHROPIC_KEY || ''}";
`;

fs.writeFileSync('config.js', content);
console.log('config.js generated from environment variables.');
