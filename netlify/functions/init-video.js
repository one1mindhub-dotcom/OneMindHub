const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
  const CF_STREAM_TOKEN = process.env.CF_STREAM_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_STREAM_TOKEN) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: `Missing env vars. CF_ACCOUNT_ID=${!!CF_ACCOUNT_ID}, CF_STREAM_TOKEN=${!!CF_STREAM_TOKEN}` }) 
    };
  }

  let size, name;
  try {
    const body = JSON.parse(event.body || '{}');
    size = body.size;
    name = body.name;
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!size || size <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file size: ' + size }) };
  }

  const safeName = (name || 'video.mp4').replace(/[^\w.\-]/g, '_');
  const encodedName = Buffer.from(safeName).toString('base64');

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${CF_ACCOUNT_ID}/stream?direct_user=true`,
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${CF_STREAM_TOKEN}`,
        'Tus-Resumable':   '1.0.0',
        'Upload-Length':   String(size),
        'Upload-Metadata': `name ${encodedName}`,
        'Upload-Creator':  'onemindhub-user',
        'Content-Length':  '0',
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: `Stream returned ${res.statusCode}: ${body}` })
          });
          return;
        }
        const uploadUrl = res.headers['location'];
        const streamUid = res.headers['stream-media-id'];
        if (!uploadUrl) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: 'No location header. Headers: ' + JSON.stringify(res.headers) })
          });
          return;
        }
        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadUrl, streamUid: streamUid || uploadUrl.split('/').pop() })
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 502, body: JSON.stringify({ error: 'Request to Cloudflare Stream timed out after 10s' }) });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 502, body: JSON.stringify({ error: 'HTTPS request error: ' + err.message }) });
    });

    req.end();
  });
};
