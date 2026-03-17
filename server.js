/* server.js — KevMo static server with Dropbox proxy endpoint */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

const DROPBOX_URL =
  'https://www.dropbox.com/scl/fi/8u9ifsy581x3konc49m42/Beer2.xlsx?rlkey=ylaxr0881z5q7bp54vyoh5kx7&st=xrfa0sjo&dl=1';

// Proxy endpoint — fetches Excel from Dropbox and pipes it to the client
app.get('/api/beer-data', async (req, res) => {
  try {
    const resp = await fetch(DROPBOX_URL, { redirect: 'follow' });
    if (!resp.ok) throw new Error('Dropbox returned ' + resp.status);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Cache-Control', 'no-cache, max-age=0');
    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('Dropbox proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from Dropbox' });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`KevMo server running at http://localhost:${PORT}`);
});
