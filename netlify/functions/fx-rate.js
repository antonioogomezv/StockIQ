const https = require('https');

exports.handler = async function() {
  return new Promise(function(resolve) {
    https.get('https://open.er-api.com/v6/latest/USD', function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          const json = JSON.parse(data);
          const rate = json && json.rates && json.rates.MXN;
          if (!rate) throw new Error('No MXN rate');
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ rate: rate })
          });
        } catch(e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
        }
      });
    }).on('error', function(e) {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
  });
};
