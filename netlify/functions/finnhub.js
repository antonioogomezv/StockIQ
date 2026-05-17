const https = require('https');

exports.handler = async function(event) {
  const key = process.env.FINNHUB_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };

  // Rebuild the Finnhub URL — pass through path and query params
  const params = event.queryStringParameters || {};
  const path = params._path || '/api/v1/quote';
  delete params._path;

  // Add token
  params.token = key;
  const query = Object.keys(params).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const url = 'https://finnhub.io' + path + '?' + query;

  return new Promise(function(resolve) {
    https.get(url, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
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
