const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from GitHub Pages and localhost
app.use(cors({
  origin: ['https://*.github.io', 'http://localhost:5500', 'http://127.0.0.1:5500', '*'],
  methods: ['GET'],
}));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'StumbleAround Proxy' });
});

// PROXY endpoint: /proxy?url=https://xataka.com
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Basic URL validation
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https allowed' });
  }

  try {
    const response = await axios.get(targetUrl, {
      timeout: 12000,
      maxContentLength: 5 * 1024 * 1024, // 5MB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      responseType: 'text',
    });

    let html = response.data;

    // Rewrite all relative URLs to absolute so images/css load correctly
    const base = `${parsed.protocol}//${parsed.host}`;

    // Inject base tag and disable annoying behaviors
    const injection = `
      <base href="${targetUrl}">
      <style>
        /* Hide cookie banners and popups */
        [class*="cookie"], [class*="Cookie"], [id*="cookie"], [id*="Cookie"],
        [class*="popup"], [class*="modal"], [class*="overlay"], [class*="gdpr"],
        [class*="banner"], [class*="consent"], [class*="newsletter"] {
          display: none !important;
        }
        /* Remove fixed headers that might conflict */
        body { padding-top: 0 !important; margin-top: 0 !important; }
      </style>
      <script>
        // Block redirects
        window.onbeforeunload = null;
        // Disable alert/confirm spam
        window.alert = function(){};
        window.confirm = function(){ return false; };
      </script>
    `;

    // Inject right after <head> or at the beginning
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + injection);
    } else if (html.includes('<head ')) {
      html = html.replace(/<head[^>]*>/, (match) => match + injection);
    } else {
      html = injection + html;
    }

    // Remove X-Frame-Options and CSP from response
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 min
    res.send(html);

  } catch (err) {
    console.error(`Proxy error for ${targetUrl}:`, err.message);
    res.status(502).json({
      error: 'Could not fetch page',
      message: err.message,
      url: targetUrl,
    });
  }
});

app.listen(PORT, () => {
  console.log(`StumbleAround proxy running on port ${PORT}`);
});
