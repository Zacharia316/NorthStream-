// api/segment-proxy.js
// Proxies HLS segments and sub-manifests server-side.
// For sub-manifests (.m3u8), rewrites internal URLs to also route through this proxy.
// For media segments (.ts/.m4s), streams bytes straight through.

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
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (NorthStream)" },
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // Sub-manifest — rewrite internal segment URLs to route through this proxy
    if (contentType.includes("mpegurl") || url.includes(".m3u8")) {
      const text = await upstream.text();
      const base = new URL(url);
      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;
          const abs = trimmed.startsWith("http") ? trimmed : new URL(trimmed, base).href;
          return `/api/segment-proxy?url=${encodeURIComponent(abs)}`;
        })
        .join("\n");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(rewritten);
    }

    // Media segment — stream straight through
    const buffer = await upstream.arrayBuffer();
    res.setHeader("Content-Type", contentType || "video/mp2t");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).json({ error: "Could not reach stream", detail: err.message });
  }
}
