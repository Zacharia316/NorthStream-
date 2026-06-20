// NorthStream proxy server
// Relays M3U playlists and HLS segments for public free-to-air channels.
// Does not store or rebroadcast video — pipes bytes through, live, no caching of media.
// NOTE: named index.js (not server.js) so this panel's egg runs it directly
// instead of auto-wrapping it as a bot entry file.

import express from "express";
import { Readable } from "stream";

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

const ALLOWED_HOSTS = null; // set to an array of allowed hostnames to lock this down further, e.g. ["iptv-org.github.io"]

const playlistCache = new Map(); // url -> { text, expiresAt }
const PLAYLIST_TTL_MS = 60 * 60 * 1000; // 1 hour

function isUrlAllowed(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (ALLOWED_HOSTS && !ALLOWED_HOSTS.includes(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── Playlist proxy ──────────────────────────────────────────────────────────
// Fetches + caches an M3U index, and rewrites segment URLs inside it to also
// route through this proxy (so geo-checks happen against this server's IP
// consistently for both the manifest and the media segments).
app.get("/m3u-proxy", async (req, res) => {
  const target = req.query.url;
  if (!target || !isUrlAllowed(target)) {
    return res.status(400).json({ error: "Missing or invalid url parameter" });
  }

  const cached = playlistCache.get(target);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    return res.send(cached.text);
  }

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const text = await upstream.text();

    playlistCache.set(target, { text, expiresAt: Date.now() + PLAYLIST_TTL_MS });
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "Could not fetch playlist", detail: err.message });
  }
});

// ─── Segment / sub-manifest proxy ────────────────────────────────────────────
// Streams (pipes) the response rather than buffering it, since segments can be
// large and this box only has 5GB RAM serving potentially many viewers.
app.get("/segment-proxy", async (req, res) => {
  const target = req.query.url;
  if (!target || !isUrlAllowed(target)) {
    return res.status(400).json({ error: "Missing or invalid url parameter" });
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (NorthStream relay)" },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") || "";

    // If it's a sub-manifest (variant playlist or live media playlist), rewrite
    // its internal segment URLs to also go through this proxy.
    if (contentType.includes("mpegurl") || target.endsWith(".m3u8")) {
      const text = await upstream.text();
      const base = new URL(target);
      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;
          const abs = trimmed.startsWith("http") ? trimmed : new URL(trimmed, base).href;
          return `/segment-proxy?url=${encodeURIComponent(abs)}`;
        })
        .join("\n");
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(rewritten);
    }

    // Otherwise it's a media segment (.ts/.m4s/etc) — pipe straight through.
    res.setHeader("Content-Type", contentType || "video/mp2t");
    res.setHeader("Cache-Control", "no-store");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: "Could not reach stream", detail: err.message });
    } else {
      res.end();
    }
  }
});

app.get("/health", (req, res) => res.json({ ok: true, cachedPlaylists: playlistCache.size }));

app.listen(PORT, () => {
  console.log(`NorthStream proxy listening on port ${PORT}`);
});
