exports.handler = async (event) => {
  const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
  const CF_STREAM_TOKEN = process.env.CF_STREAM_TOKEN;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { size, name } = JSON.parse(event.body || '{}');
    if (!size || size <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file size' }) };
    }

    const safeName = (name || 'video.mp4').replace(/[^\w.\-]/g, '_');

    const tusRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: 'POST',
        headers: {
          'Authorization':   `Bearer ${CF_STREAM_TOKEN}`,
          'Tus-Resumable':   '1.0.0',
          'Upload-Length':   String(size),
          'Upload-Metadata': `name ${Buffer.from(safeName).toString('base64')}`,
          'Upload-Creator':  'onemindhub-user',
        }
      }
    );

    if (!tusRes.ok) {
      const errText = await tusRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: `Stream init failed (${tusRes.status}): ${errText}` }) };
    }

    const uploadUrl = tusRes.headers.get('location');
    const streamUid = tusRes.headers.get('stream-media-id');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, streamUid: streamUid || uploadUrl.split('/').pop() })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
