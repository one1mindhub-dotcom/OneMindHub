const https = require('https');

exports.handler = async (event) => {
  const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
  const CF_STREAM_TOKEN = process.env.CF_STREAM_TOKEN;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!CF_ACCOUNT_ID || !CF_STREAM_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing environment variables CF_ACCOUNT_ID or CF_STREAM_TOKEN' }) };
  }

  try {
    const { size, name } = JSON.parse(event.body || '{}');
    if (!size || size <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file size: ' + size }) };
    }

    const safeName = (name || 'video.mp4').replace(/[^\w.\-]/g, '_');
    const encodedName = Buffer.from(safeName).toString('base64');

    // Use https module instead of fetch for Node compatibility
    const result = await new Promise((resolve, reject) => {
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
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      req.end();
    });

    if (result.status !== 200 && result.status !== 201) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `Stream init failed (${result.status}): ${result.body}` })
      };
    }

    const uploadUrl = result.headers['location'];
    const streamUid = result.headers['stream-media-id'];

    if (!uploadUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No location header from Stream. Headers: ' + JSON.stringify(result.headers) })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, streamUid: streamUid || uploadUrl.split('/').pop() })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
