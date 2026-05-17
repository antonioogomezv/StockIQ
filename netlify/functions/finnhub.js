const https = require('https');

// In-memory cache: key → { body, ts }
const _cache = new Map();

// Cache TTL per endpoint type (milliseconds)
function cacheTtl(path) {
  if (path.includes('/quote')) return 60000;           // 1 min — live prices
  if (path.includes('/metric')) return 3600000;        // 1 hour — fundamentals
  if (path.includes('/profile2')) return 86400000;     // 24h — company info
  if (path.includes('/company-news')) return 1800000;  // 30 min — news
  if (path.includes('/candle')) return 3600000;        // 1 hour — chart data
  return 300000;                                       // 5 min — everything else
}

exports.handler = async function(event) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };

  // Rebuild the Finnhub URL — pass through path and query params
  const params = event.queryStringParameters || {};
  const path = params._path || '/api/v1/quote';
  delete params._path;

  // Check in-memory cache (survives within the same Lambda warm instance)
  const cacheKey = path + '?' + JSON.stringify(params);
  const ttl = cacheTtl(path);
  const cached = _cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < ttl) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: cached.body
    };
  }

  // Add token
  params.token = key;
  const query = Object.keys(params).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const url = 'https://finnhub.io' + path + '?' + query;

  return new Promise(function(resolve) {
    https.get(url, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        // Store in cache (cap cache size to 200 entries)
        if (_cache.size >= 200) {
          const firstKey = _cache.keys().next().value;
          _cache.delete(firstKey);
        }
        _cache.set(cacheKey, { body: data, ts: Date.now() });
        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: data
        });
      });
    }).on('error', function(e) {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
  });
};
