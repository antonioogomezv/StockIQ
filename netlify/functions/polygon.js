const https = require('https');

exports.handler = async function(event) {
  const key = process.env.POLYGON_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };

  const params = event.queryStringParameters || {};
  const path = params._path || '/v2/aggs/ticker/SPY/range/1/day/2024-01-01/2024-01-02';
  delete params._path;

  params.apiKey = key;
  const query = Object.keys(params).map(function(k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  const url = 'https://api.polygon.io' + path + '?' + query;

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
