/* api/beer-data.js — Vercel serverless proxy for Dropbox Beer2.xlsx */

const DROPBOX_URL =
  'https://www.dropbox.com/scl/fi/8u9ifsy581x3konc49m42/Beer2.xlsx?rlkey=ylaxr0881z5q7bp54vyoh5kx7&st=xrfa0sjo&dl=1';

module.exports = async function handler(req, res) {
  try {
    const resp = await fetch(DROPBOX_URL, { redirect: 'follow' });
    if (!resp.ok) throw new Error('Dropbox returned ' + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.send(buf);
  } catch (err) {
    console.error('Dropbox proxy error:', err.message);
    res.status(502).json({ error: 'Failed to fetch from Dropbox' });
  }
};
