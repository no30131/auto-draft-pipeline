const express = require('express');
const https = require('https');

const app = express();
app.use(express.json());

const WP_BASE = (process.env.WP_BASE_URL || '').replace(/\/$/, '') + '/wp-json/wp/v2';
const USERNAME = process.env.WP_USERNAME;
const PASSWORD = process.env.WP_APP_PASSWORD;

if (!process.env.WP_BASE_URL || !USERNAME || !PASSWORD) {
  console.error('Missing required env vars: WP_BASE_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

function getAuthToken() {
  return Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
}

function wpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(WP_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

app.post('/resolve-tags', async (req, res) => {
  const { tags } = req.body;
  if (!tags || !Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags must be an array' });
  }

  try {
    const tagIds = await Promise.all(tags.map(async (tagName) => {
      // 搜尋標籤
      const results = await wpRequest('GET', `/tags?search=${encodeURIComponent(tagName)}`);
      const exact = Array.isArray(results) ? results.find(t => t.name === tagName) : null;

      if (exact) return exact.id;

      // 不存在就建立
      const created = await wpRequest('POST', '/tags', { name: tagName });
      return created.id || created.data?.term_id || null;
    }));

    res.json({ tagIds: tagIds.filter(id => id !== null) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`wp-tag-resolver running on port ${PORT}`));