// api/m3u-proxy.js
// Fetches an M3U playlist server-side and returns it to the browser,
// bypassing CORS restrictions. Caches for 1 hour via Vercel's CDN.

const ALLOWED_PROTOCOLS = ["http:", "https:"];

function isUrlAllowed(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return ALLOWED_PROTOCOLS.includes(u.protocol);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { url } = req.query;
  if (!url || !isUrlAllowed(url)) {
    return res.status(400).json({ error: "Missing or invalid url parameter" });
  }

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (NorthStream)" },
    });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const text = await upstream.text();
    if (!text.includes("#EXTM3U")) throw new Error("Not a valid M3U playlist");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return res.status(200).send(text);
  } catch (err) {
    return res.status(502).json({ error: "Could not fetch playlist", detail: err.message });
  }
}
