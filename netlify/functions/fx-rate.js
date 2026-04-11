const https = require('https');

exports.handler = async function() {
  return new Promise(function(resolve) {
    https.get('https://api.frankfurter.app/latest?from=USD&to=MXN', function(res) {
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
