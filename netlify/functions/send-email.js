const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Email not configured' }) };

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: 'Bad request' }; }

  const { to, subject, html } = body;
  if (!to || !subject || !html) return { statusCode: 400, body: 'Missing fields' };

  const payload = JSON.stringify({
    from: 'StockIQ <noreply@stockiq.app>',
    to: [to],
    subject: subject,
    html: html
  });

  return new Promise(function(resolve) {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        resolve({
          statusCode: res.statusCode < 300 ? 200 : 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: data
        });
      });
    });
    req.on('error', function(e) { resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }); });
    req.write(payload);
    req.end();
  });
};
