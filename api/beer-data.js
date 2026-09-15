/* api/beer-data.js — Vercel serverless proxy for Dropbox Beer3.xlsx */

const DROPBOX_URL =
  'https://www.dropbox.com/scl/fi/0f3beusdcstafy7ynf5tj/Beer3.xlsx?rlkey=tzupj0ip8barsn48rhjqjzdat&st=cz2qy013&dl=1';

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
