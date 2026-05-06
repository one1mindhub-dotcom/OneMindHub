// netlify/functions/check-video-status.js
// Polls Cloudflare Stream to check if a video is ready to play.
// Called by the client after TUS upload completes.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { streamUid } = body;
  if (!streamUid) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing streamUid' }) };
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken  = process.env.CF_STREAM_TOKEN; // same token your init-video function uses

  if (!accountId || !apiToken) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Cloudflare credentials' }) };
  }

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: 'Cloudflare API error', detail: text }),
      };
    }

    const data = await res.json();
    const ready = data?.result?.readyToStream === true;

    // DEBUG: return full Cloudflare response so client can diagnose readyToStream issues
    console.log('[check-video-status] CF response:', JSON.stringify(data));
    return {
      statusCode: 200,
      body: JSON.stringify({ ready, uid: streamUid, debug: data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
