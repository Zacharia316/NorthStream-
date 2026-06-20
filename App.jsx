import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ---------------------------------------------------------
   NORTHSTREAM — Home Screen Demo
   Arctic broadcast tower theme. Mock data only, for interaction
   testing. Player: sticky top mini-player, tap/swipe to expand.
--------------------------------------------------------- */

const CATEGORIES = ["All", "Sports", "News", "Movies", "Kids", "Music", "Docs"];

const DEFAULT_M3U_INDEX = "https://iptv-org.github.io/iptv/index.m3u";
const PROXY_BASE = "http://panel.bwmxmd.co.ke:25039"; // paste your Pterodactyl server's public URL here once deployed, e.g. "https://abc123.ploud.co:25565"

const CATEGORY_MAP = {
  sport: "Sports", news: "News", movie: "Movies", film: "Movies",
  kids: "Kids", cartoon: "Kids", music: "Music",
  documentary: "Docs", science: "Docs", nature: "Docs",
};
function normalizeCategory(group) {
  const g = (group || "").toLowerCase();
  for (const key of Object.keys(CATEGORY_MAP)) {
    if (g.includes(key)) return CATEGORY_MAP[key];
  }
  return "Movies" in CATEGORIES ? "Movies" : "News";
}

const HUES = ["#1F6F5C", "#1B2A4A", "#2D4A3E", "#0F3D3E", "#26392E", "#33304A"];

function parseM3U(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  let meta = {};
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.+)$/);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const countryMatch = line.match(/tvg-country="([^"]*)"/i);
      meta = {
        name: nameMatch ? nameMatch[1].trim() : "Unknown channel",
        rawGroup: groupMatch ? groupMatch[1].trim() : "General",
        country: countryMatch ? countryMatch[1].trim() : "—",
      };
    } else if (line.startsWith("http") && meta.name) {
      idx += 1;
      const category = normalizeCategory(meta.rawGroup);
      out.push({
        id: `m-${idx}`,
        name: meta.name,
        category: CATEGORIES.includes(category) ? category : "Movies",
        country: meta.country,
        quality: "Auto",
        geoBlocked: false,
        alwaysOn: true,
        url: line,
      });
      meta = {};
    }
  }
  return out;
}

async function fetchAndParsePlaylist(sourceUrl) {
  const target = PROXY_BASE
    ? `${PROXY_BASE}/m3u-proxy?url=${encodeURIComponent(sourceUrl)}`
    : sourceUrl;
  const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Playlist unreachable");
  const text = await res.text();
  if (!text.includes("#EXTM3U")) throw new Error("Not a valid M3U playlist");
  const channels = parseM3U(text);
  if (channels.length === 0) throw new Error("No channels found in playlist");
  return channels;
}

function buildFeatured(channels) {
  const seen = new Set();
  const picks = [];
  for (const ch of channels) {
    if (seen.has(ch.category)) continue;
    seen.add(ch.category);
    picks.push(ch);
    if (picks.length >= 5) break;
  }
  return picks.map((ch, i) => ({
    id: ch.id,
    name: ch.name,
    category: ch.category,
    tag: "LIVE",
    hue: HUES[i % HUES.length],
  }));
}

function streamUrlFor(channel) {
  if (!channel?.url) return null;
  return PROXY_BASE
    ? `${PROXY_BASE}/segment-proxy?url=${encodeURIComponent(channel.url)}`
    : channel.url;
}

function groupByCategory(channels) {
  const groups = {};
  channels.forEach((ch) => {
    if (!groups[ch.category]) groups[ch.category] = [];
    groups[ch.category].push(ch);
  });
  return groups;
}

/* Lightweight mock EPG — deterministic per channel so it doesn't shuffle on re-render */
const SHOW_TITLES = [
  "Morning Briefing", "Match Replay", "Studio Talk", "Wildlife Hour", "Late Edition",
  "The Bridge", "Signal Check", "North Desk", "Open Air", "Night Watch",
];
function mockEpgFor(channel) {
  let seed = channel.id.charCodeAt(1) + channel.name.length;
  const slots = [];
  let hour = 6;
  for (let i = 0; i < 5; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const title = SHOW_TITLES[seed % SHOW_TITLES.length];
    const duration = 1 + (seed % 2);
    slots.push({
      time: `${String(hour % 24).padStart(2, "0")}:00`,
      title,
      live: i === 1,
    });
    hour += duration;
  }
  return slots;
}

/* ---------------- Icons (inline SVG, no emoji) ---------------- */

const IconSearch = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconPlay = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconPause = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
    <rect x="6" y="5" width="4" height="14" />
    <rect x="14" y="5" width="4" height="14" />
  </svg>
);

const IconChevronDown = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconChevronUp = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const IconClose = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconLock = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const IconUnlock = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.4-2" />
  </svg>
);

const IconSignal = (props) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 18a8 8 0 0 1 16 0" />
    <path d="M8 18a4 4 0 0 1 8 0" />
    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" />
    <line x1="12" y1="9" x2="12" y2="4" />
  </svg>
);

const IconHome = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
  </svg>
);

const IconGuide = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="4" x2="8" y2="9" />
  </svg>
);

const IconHeart = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

const IconSettings = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

const IconSun = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22" />
    <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" />
    <line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
    <line x1="2" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" />
    <line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
  </svg>
);

const IconMoon = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const IconRetry = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const IconBookmark = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </svg>
);

const IconGlobe = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
  </svg>
);

const IconBars = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" {...props}>
    <rect x="3" y="14" width="3" height="7" rx="0.5" />
    <rect x="10.5" y="9" width="3" height="12" rx="0.5" />
    <rect x="18" y="4" width="3" height="17" rx="0.5" />
  </svg>
);

const IconAlertTriangle = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3 2 20h20L12 3z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </svg>
);

const IconLink = (props) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
);

const IconCheck = (props) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ---------------- Theme tokens ---------------- */

const THEMES = {
  dark: {
    bg: "#05080A",
    bgElevated: "#0A1015",
    bgCard: "#0E1620",
    border: "rgba(120, 245, 200, 0.12)",
    borderStrong: "rgba(120, 245, 200, 0.28)",
    text: "#E8F2EE",
    textDim: "#7C9089",
    accent: "#39FFB0",
    accentDim: "rgba(57, 255, 176, 0.15)",
    shadow: "0 20px 50px rgba(0,0,0,0.55)",
  },
  light: {
    bg: "#F2F6F4",
    bgElevated: "#FFFFFF",
    bgCard: "#FFFFFF",
    border: "rgba(15, 45, 35, 0.10)",
    borderStrong: "rgba(15, 45, 35, 0.22)",
    text: "#0C1A15",
    textDim: "#5C6D66",
    accent: "#0E9E6B",
    accentDim: "rgba(14, 158, 107, 0.12)",
    shadow: "0 16px 40px rgba(15,45,35,0.10)",
  },
};

export default function NorthStreamHome() {
  const [mode, setMode] = useState("dark");
  const t = THEMES[mode];

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const [heroIndex, setHeroIndex] = useState(0);
  const heroTimerRef = useRef(null);

  const [activeChannel, setActiveChannel] = useState(null); // channel object or null
  const [playerState, setPlayerState] = useState("closed"); // closed | full | mini
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLocked, setIsLocked] = useState(false); // sticky-lock the video while scrolling content below
  const [controlsVisible, setControlsVisible] = useState(true); // tap-to-hide overlay controls
  const [isRetrying, setIsRetrying] = useState(false);
  const dragStartY = useRef(null);

  const [screen, setScreen] = useState("home"); // home | guide | favorites | settings
  const [favorites, setFavorites] = useState(() => new Set());

  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState("");

  const [playlistUrl, setPlaylistUrl] = useState(""); // custom M3U source, empty = built-in channels
  const [playlistDraft, setPlaylistDraft] = useState("");
  const [playlistStatus, setPlaylistStatus] = useState("idle"); // idle | loading | active | error

  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [playerError, setPlayerError] = useState(false);

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const retryStream = () => {
    setIsRetrying(true);
    setPlayerError(false);
    setIsPlaying(false);
    setTimeout(() => {
      attachStream(activeChannel);
      setIsRetrying(false);
    }, 600);
  };

  const loadPlaylist = () => {
    const url = playlistDraft.trim();
    if (!url) return;
    setPlaylistStatus("loading");
    fetchAndParsePlaylist(url)
      .then((parsed) => {
        setChannels(parsed);
        setPlaylistUrl(url);
        setPlaylistStatus("active");
      })
      .catch(() => setPlaylistStatus("error"));
  };

  const clearPlaylist = () => {
    setPlaylistUrl("");
    setPlaylistDraft("");
    setPlaylistStatus("idle");
    setChannelsLoading(true);
    fetchAndParsePlaylist(DEFAULT_M3U_INDEX)
      .then(setChannels)
      .catch(() => setChannelsError("Could not reach the channel index."))
      .finally(() => setChannelsLoading(false));
  };

  /* ---- Initial channel load ---- */
  useEffect(() => {
    fetchAndParsePlaylist(DEFAULT_M3U_INDEX)
      .then(setChannels)
      .catch(() => setChannelsError("Could not reach the channel index. Try again shortly."))
      .finally(() => setChannelsLoading(false));
  }, []);

  /* ---- Real HLS playback, tied to activeChannel + isPlaying ---- */
  const attachStream = useCallback((channel) => {
    const video = videoRef.current;
    const src = streamUrlFor(channel);
    if (!video || !src) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setPlayerError(false);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }

    import("hls.js").then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        setPlayerError(true);
        return;
      }
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        abrEwmaDefaultEstimate: 500000,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 4,
        fragLoadingTimeOut: 8000,
        manifestLoadingTimeOut: 8000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setPlayerError(true);
      });
    }).catch(() => setPlayerError(true));
  }, []);

  useEffect(() => {
    if (activeChannel) attachStream(activeChannel);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeChannel, attachStream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying]);

  const FEATURED = useMemo(() => buildFeatured(channels), [channels]);

  /* ---- Hero auto-scroll: 3 seconds ---- */
  useEffect(() => {
    if (FEATURED.length === 0) return;
    heroTimerRef.current = setInterval(() => {
      setHeroIndex((i) => (i + 1) % FEATURED.length);
    }, 3000);
    return () => clearInterval(heroTimerRef.current);
  }, [FEATURED.length]);

  const pauseHeroAutoScroll = useCallback(() => {
    clearInterval(heroTimerRef.current);
  }, []);

  const resumeHeroAutoScroll = useCallback(() => {
    clearInterval(heroTimerRef.current);
    if (FEATURED.length === 0) return;
    heroTimerRef.current = setInterval(() => {
      setHeroIndex((i) => (i + 1) % FEATURED.length);
    }, 3000);
  }, [FEATURED.length]);

  /* ---- Player controls ---- */
  const openChannel = (channel) => {
    setActiveChannel(channel);
    setPlayerState("full");
    setIsPlaying(true);
    setIsLocked(false);
    setControlsVisible(true);
  };

  const collapseToMini = () => setPlayerState("mini");
  const expandToFull = () => setPlayerState("full");
  const closePlayer = () => {
    setPlayerState("closed");
    setActiveChannel(null);
    setIsLocked(false);
    setControlsVisible(true);
  };

  /* ---- Swipe handling on mini player (expand) and full player (collapse) ---- */
  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const handleMiniTouchEnd = (e) => {
    if (dragStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    if (dy < -30) expandToFull(); // swipe up
    dragStartY.current = null;
  };
  const handleFullTouchEnd = (e) => {
    if (dragStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    if (dy > 40) collapseToMini(); // swipe down
    dragStartY.current = null;
  };

  const filteredChannels = channels.filter((ch) => {
    const matchesCategory = activeCategory === "All" || ch.category === activeCategory;
    const matchesSearch = ch.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const searchResults = searchQuery.trim()
    ? channels.filter((ch) => ch.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const grouped = groupByCategory(
    activeCategory === "All" ? channels : channels.filter((c) => c.category === activeCategory)
  );

  const playerVisible = playerState !== "closed";
  const hero = FEATURED.length > 0 ? FEATURED[heroIndex % FEATURED.length] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: t.bg,
        color: t.text,
        fontFamily: "'Space Grotesk', 'Inter', sans-serif",
        transition: "background 0.3s ease, color 0.3s ease",
        paddingTop: playerVisible && playerState === "mini" ? "64px" : "0px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .ns-scrollbar::-webkit-scrollbar { height: 0; width: 0; }
        .ns-rail { scroll-behavior: smooth; }
        .ns-fade-in { animation: nsFadeIn 0.25s ease; }
        @keyframes nsFadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
        @keyframes nsSlideUp { from { transform: translateY(100%);} to { transform: translateY(0);} }
        @keyframes nsPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ns-live-dot { animation: nsPulse 1.8s ease-in-out infinite; }
        @keyframes nsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        button { font-family: inherit; cursor: pointer; }
        input { font-family: inherit; }
      `}</style>

      {/* ---------------- VIDEO ELEMENT (persists across mini/full) ---------------- */}
      {playerVisible && activeChannel && (
        <video
          ref={videoRef}
          playsInline
          muted={false}
          style={{
            position: playerState === "full" ? "absolute" : "fixed",
            top: playerState === "mini" ? "-9999px" : 0,
            left: 0,
            width: "100%",
            aspectRatio: "16 / 9",
            background: "#000",
            zIndex: playerState === "full" ? 1 : -1,
            objectFit: "contain",
          }}
        />
      )}
      {playerError && playerVisible && (
        <div
          style={{
            position: "fixed",
            top: playerState === "mini" ? 8 : "auto",
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: "11px",
            color: "#FF6B5E",
            zIndex: 400,
            pointerEvents: "none",
          }}
        />
      )}

      {/* ---------------- MINI PLAYER (sticky top) ---------------- */}
      {playerVisible && playerState === "mini" && activeChannel && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleMiniTouchEnd}
          onClick={expandToFull}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "64px",
            background: t.bgElevated,
            borderBottom: `1px solid ${t.border}`,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "0 14px",
            zIndex: 200,
            boxShadow: t.shadow,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "8px",
              background: `linear-gradient(135deg, ${t.accentDim}, transparent)`,
              border: `1px solid ${t.borderStrong}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <IconSignal color={t.accent} style={{ color: t.accent }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {activeChannel.name}
            </div>
            <div style={{ fontSize: "11px", color: t.textDim, display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="ns-live-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
              Live now
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPlaying((p) => !p);
            }}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              border: `1px solid ${t.borderStrong}`,
              background: "transparent",
              color: t.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              expandToFull();
            }}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              border: `1px solid ${t.borderStrong}`,
              background: "transparent",
              color: t.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconChevronDown style={{ transform: "rotate(180deg)" }} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closePlayer();
            }}
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              border: `1px solid ${t.borderStrong}`,
              background: "transparent",
              color: t.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconClose />
          </button>
        </div>
      )}

      {/* ---------------- FULLSCREEN PLAYER ---------------- */}
      {playerVisible && playerState === "full" && activeChannel && (
        <div
          className="ns-fade-in"
          style={{
            position: "fixed",
            inset: 0,
            background: t.bg,
            zIndex: 300,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Video area — pinned when locked, otherwise scrolls away with content */}
          <div
            onTouchStart={!isLocked ? handleTouchStart : undefined}
            onTouchEnd={!isLocked ? handleFullTouchEnd : undefined}
            onClick={() => setControlsVisible((v) => !v)}
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              background: "#000",
              position: isLocked ? "sticky" : "relative",
              top: 0,
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {playerError && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: t.textDim,
                  background: `radial-gradient(ellipse at top, ${t.accentDim}, ${t.bgElevated} 70%)`,
                  zIndex: 2,
                }}
              >
                <IconAlertTriangle width="22" height="22" />
                <span style={{ fontSize: "13px", fontWeight: 600, color: t.text }}>Signal lost</span>
                <span style={{ fontSize: "11px", maxWidth: "220px", textAlign: "center" }}>
                  Channel may be offline or temporarily unreachable
                </span>
              </div>
            )}
            {/* Top overlay row: collapse, live badge, lock, close */}
            <div
              style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                right: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: controlsVisible ? 1 : 0,
                pointerEvents: controlsVisible ? "auto" : "none",
                transition: "opacity 0.2s ease",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  collapseToMini();
                }}
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  border: `1px solid ${t.borderStrong}`,
                  background: "rgba(0,0,0,0.3)",
                  color: t.text,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconChevronDown />
              </button>

              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "rgba(0,0,0,0.35)",
                  border: `1px solid ${t.borderStrong}`,
                  borderRadius: "20px",
                  padding: "4px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span className="ns-live-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
                LIVE
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLocked((l) => !l);
                  }}
                  title={isLocked ? "Unlock player" : "Lock player to top"}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: `1px solid ${isLocked ? t.accent : t.borderStrong}`,
                    background: isLocked ? t.accentDim : "rgba(0,0,0,0.3)",
                    color: isLocked ? t.accent : t.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isLocked ? <IconLock /> : <IconUnlock />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closePlayer();
                  }}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: `1px solid ${t.borderStrong}`,
                    background: "rgba(0,0,0,0.3)",
                    color: t.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconClose />
                </button>
              </div>
            </div>

            {/* Play/pause */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying((p) => !p);
              }}
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                border: `1px solid ${t.borderStrong}`,
                background: "rgba(0,0,0,0.35)",
                color: t.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: controlsVisible ? 1 : 0,
                pointerEvents: controlsVisible ? "auto" : "none",
                transition: "opacity 0.2s ease",
              }}
            >
              {isPlaying ? <IconPause width="22" height="22" /> : <IconPlay width="22" height="22" />}
            </button>

            {/* Buffering / live indicator */}
            {isRetrying && (
              <div
                style={{
                  position: "absolute",
                  bottom: "16px",
                  left: "16px",
                  right: "16px",
                  textAlign: "center",
                  fontSize: "11px",
                  color: t.accent,
                  fontFamily: "'JetBrains Mono', monospace",
                  opacity: controlsVisible ? 1 : 0,
                  transition: "opacity 0.2s ease",
                }}
              >
                RECONNECTING…
              </div>
            )}

            {/* Small persistent lock indicator when controls are hidden, so it's still reachable */}
            {!controlsVisible && isLocked && (
              <div
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: t.accent,
                }}
              />
            )}
          </div>

          {/* Content below player — independently scrollable once locked */}
          <div
            onTouchStart={isLocked ? handleTouchStart : undefined}
            onTouchEnd={isLocked ? handleFullTouchEnd : undefined}
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* Info below player */}
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <div style={{ fontSize: "11px", color: t.accent, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>
                  {activeChannel.category.toUpperCase()} · FREE-TO-AIR
                </div>
                <button
                  onClick={() => toggleFavorite(activeChannel.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: favorites.has(activeChannel.id) ? t.accentDim : "transparent",
                    border: `1px solid ${favorites.has(activeChannel.id) ? t.accent : t.border}`,
                    borderRadius: "20px",
                    padding: "5px 10px",
                    color: favorites.has(activeChannel.id) ? t.accent : t.textDim,
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  <IconBookmark fill={favorites.has(activeChannel.id) ? "currentColor" : "none"} />
                  {favorites.has(activeChannel.id) ? "Saved" : "Save"}
                </button>
              </div>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>{activeChannel.name}</h2>

              {/* Metadata row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                <MetaPill t={t} icon={<IconGlobe />} label={activeChannel.country} />
                <MetaPill t={t} icon={<IconBars />} label={activeChannel.quality} />
                {activeChannel.alwaysOn && <MetaPill t={t} icon={<IconSignal width="13" height="13" />} label="24/7" />}
                {activeChannel.geoBlocked && (
                  <MetaPill t={t} icon={<IconAlertTriangle />} label="Geo-blocked" warn />
                )}
              </div>

              {/* Stylized retry control, in the freed-up description space */}
              <button
                onClick={retryStream}
                disabled={isRetrying}
                style={{
                  marginTop: "16px",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "11px",
                  borderRadius: "10px",
                  border: `1px dashed ${t.borderStrong}`,
                  background: t.bgCard,
                  color: isRetrying ? t.accent : t.textDim,
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    animation: isRetrying ? "nsSpin 0.8s linear infinite" : "none",
                  }}
                >
                  <IconRetry />
                </span>
                {isRetrying ? "Reconnecting to stream…" : "Stream didn't load? Retry"}
              </button>
            </div>

            {/* Keep-browsing channels — wraps into as many rows as needed */}
            <div style={{ padding: "0 20px 24px" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px", color: t.textDim }}>
                More in {activeChannel.category}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: "10px",
                }}
              >
                {channels.filter((c) => c.category === activeChannel.category && c.id !== activeChannel.id).map((c) => (
                  <ChannelCard
                    key={c.id}
                    channel={c}
                    t={t}
                    onClick={() => openChannel(c)}
                    isFavorite={favorites.has(c.id)}
                    onToggleFavorite={() => toggleFavorite(c.id)}
                    compact
                    fullWidth
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- HOME SCREEN ---------------- */}
      {screen === "home" && (
        <>
      {/* ---------------- HEADER ---------------- */}
      <header style={{ padding: "20px 16px 0", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                background: `linear-gradient(135deg, ${t.accent}, transparent)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${t.borderStrong}`,
              }}
            >
              <IconSignal style={{ color: t.bg }} />
            </div>
            <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
              North<span style={{ color: t.accent }}>Stream</span>
            </span>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: t.bgCard,
              border: `1px solid ${searchFocused ? t.borderStrong : t.border}`,
              borderRadius: "12px",
              padding: "10px 12px",
              transition: "border 0.15s ease",
            }}
          >
            <span style={{ color: t.textDim, display: "flex" }}>
              <IconSearch />
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search channels"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: t.text,
                fontSize: "14px",
              }}
            />
          </div>

          {searchFocused && searchQuery.trim() && (
            <div
              className="ns-fade-in"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: t.bgElevated,
                border: `1px solid ${t.border}`,
                borderRadius: "12px",
                boxShadow: t.shadow,
                overflow: "hidden",
                zIndex: 50,
                maxHeight: "260px",
                overflowY: "auto",
              }}
            >
              {searchResults.length === 0 ? (
                <div style={{ padding: "14px", fontSize: "13px", color: t.textDim }}>
                  No channels match "{searchQuery}"
                </div>
              ) : (
                searchResults.map((ch) => (
                  <button
                    key={ch.id}
                    onMouseDown={() => {
                      openChannel(ch);
                      setSearchQuery("");
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: `1px solid ${t.border}`,
                      color: t.text,
                    }}
                  >
                    <span style={{ color: t.accent, display: "flex" }}>
                      <IconSignal width="16" height="16" />
                    </span>
                    <span style={{ fontSize: "13px" }}>{ch.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: t.textDim }}>{ch.category}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "16px" }} className="ns-scrollbar">
          {CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  flexShrink: 0,
                  padding: "8px 16px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  border: `1px solid ${active ? t.accent : t.border}`,
                  background: active ? t.accentDim : "transparent",
                  color: active ? t.accent : t.textDim,
                  transition: "all 0.15s ease",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </header>

      {/* ---------------- HERO: auto-scrolling featured rail (3s) ---------------- */}
      {hero && (
      <section style={{ padding: "0 16px 28px" }}>
        <div
          onTouchStart={pauseHeroAutoScroll}
          onTouchEnd={resumeHeroAutoScroll}
          onMouseEnter={pauseHeroAutoScroll}
          onMouseLeave={resumeHeroAutoScroll}
          onClick={() => openChannel(channels.find((c) => c.name === hero.name) || channels[0])}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 8.5",
            borderRadius: "18px",
            overflow: "hidden",
            cursor: "pointer",
            border: `1px solid ${t.border}`,
          }}
        >
          {FEATURED.map((f, i) => (
            <div
              key={f.id}
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(135deg, ${f.hue}, ${t.bg} 85%)`,
                opacity: i === heroIndex ? 1 : 0,
                transition: "opacity 0.6s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: t.accent,
                  letterSpacing: "0.06em",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span className="ns-live-dot" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
                {f.tag} · {f.category.toUpperCase()}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>{f.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  <IconPlay />
                </div>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)" }}>Tap to watch</span>
              </div>
            </div>
          ))}

          {/* progress dots */}
          <div style={{ position: "absolute", top: "14px", right: "14px", display: "flex", gap: "5px" }}>
            {FEATURED.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === heroIndex ? "16px" : "6px",
                  height: "4px",
                  borderRadius: "2px",
                  background: i === heroIndex ? t.accent : "rgba(255,255,255,0.35)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ---------------- CHANNEL RAILS ---------------- */}
      <main style={{ padding: "0 16px 100px" }}>
        {channelsLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: t.textDim, fontSize: "14px" }}>
            Scanning for channels…
          </div>
        ) : channelsError ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#FF6B5E", fontSize: "14px" }}>
            {channelsError}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: t.textDim, fontSize: "14px" }}>
            No channels found
          </div>
        ) : (
          Object.entries(grouped).map(([category, channels]) => (
            <div key={category} style={{ marginBottom: "26px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>{category}</h3>
                <span style={{ fontSize: "12px", color: t.textDim }}>{channels.length} channels</span>
              </div>
              <div style={{ display: "flex", gap: "12px", overflowX: "auto" }} className="ns-rail ns-scrollbar">
                {channels.map((ch) => (
                  <ChannelCard
                    key={ch.id}
                    channel={ch}
                    t={t}
                    onClick={() => openChannel(ch)}
                    isFavorite={favorites.has(ch.id)}
                    onToggleFavorite={() => toggleFavorite(ch.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>
        </>
      )}

      {/* ---------------- GUIDE SCREEN (EPG of saved channels) ---------------- */}
      {screen === "guide" && (
        <GuideScreen
          t={t}
          channels={channels.filter((c) => favorites.has(c.id))}
          onOpenChannel={openChannel}
        />
      )}

      {/* ---------------- FAVORITES SCREEN ---------------- */}
      {screen === "favorites" && (
        <FavoritesScreen
          t={t}
          channels={channels.filter((c) => favorites.has(c.id))}
          onOpenChannel={openChannel}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* ---------------- SETTINGS SCREEN ---------------- */}
      {screen === "settings" && (
        <SettingsScreen
          t={t}
          mode={mode}
          setMode={setMode}
          favoriteCount={favorites.size}
          playlistUrl={playlistUrl}
          playlistDraft={playlistDraft}
          setPlaylistDraft={setPlaylistDraft}
          playlistStatus={playlistStatus}
          onLoadPlaylist={loadPlaylist}
          onClearPlaylist={clearPlaylist}
        />
      )}

      {/* ---------------- BOTTOM TAB NAV ---------------- */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "64px",
          background: t.bgElevated,
          borderTop: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          zIndex: 150,
        }}
      >
        {[
          { key: "home", label: "Home", icon: IconHome },
          { key: "guide", label: "Guide", icon: IconGuide },
          { key: "favorites", label: "Favorites", icon: IconHeart },
          { key: "settings", label: "Settings", icon: IconSettings },
        ].map(({ key, label, icon: Icon }) => {
          const active = screen === key;
          return (
            <button
              key={key}
              onClick={() => setScreen(key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                background: "transparent",
                border: "none",
                color: active ? t.accent : t.textDim,
                fontSize: "11px",
              }}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ChannelCard({ channel, t, onClick, compact, fullWidth, isFavorite, onToggleFavorite }) {
  return (
    <div
      style={{
        flexShrink: fullWidth ? undefined : 0,
        width: fullWidth ? "100%" : compact ? "120px" : "140px",
        position: "relative",
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: "100%",
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: "14px",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          textAlign: "left",
          color: t.text,
          transition: "border 0.15s ease, transform 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.borderStrong)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.border)}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${t.accentDim}, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <span style={{ color: t.accent }}>
            <IconSignal />
          </span>
          <div
            style={{
              position: "absolute",
              bottom: "6px",
              right: "6px",
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <IconPlay width="11" height="11" />
          </div>
          {channel.geoBlocked && (
            <div
              style={{
                position: "absolute",
                top: "6px",
                left: "6px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFB23E",
              }}
              title="Geo-blocked"
            >
              <IconAlertTriangle width="11" height="11" />
            </div>
          )}
        </div>

        <div style={{ fontSize: "12px", fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {channel.name}
        </div>

        {!compact && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            <MiniBadge t={t} label={channel.country} />
            <MiniBadge t={t} label={channel.quality} />
            {channel.alwaysOn && <MiniBadge t={t} label="24/7" accent />}
          </div>
        )}
      </button>

      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorite ? "Remove from favorites" : "Save channel"}
          style={{
            position: "absolute",
            top: "18px",
            right: "18px",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.45)",
            color: isFavorite ? t.accent : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconBookmark width="12" height="12" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}

function MiniBadge({ t, label, accent }) {
  return (
    <span
      style={{
        fontSize: "9px",
        fontFamily: "'JetBrains Mono', monospace",
        padding: "2px 6px",
        borderRadius: "8px",
        background: accent ? t.accentDim : "transparent",
        border: `1px solid ${accent ? t.accent : t.border}`,
        color: accent ? t.accent : t.textDim,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function MetaPill({ t, icon, label, warn }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11px",
        padding: "5px 10px",
        borderRadius: "20px",
        background: warn ? "rgba(255, 178, 62, 0.12)" : t.bgCard,
        border: `1px solid ${warn ? "#FFB23E" : t.border}`,
        color: warn ? "#FFB23E" : t.textDim,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

/* ---------------- GUIDE SCREEN — EPG for saved channels ---------------- */
function GuideScreen({ t, channels, onOpenChannel }) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Guide</h2>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: t.textDim }}>
          Schedule for your saved channels
        </p>
      </div>

      {channels.length === 0 ? (
        <EmptyState
          t={t}
          icon={<IconGuide width="28" height="28" />}
          title="No saved channels yet"
          subtitle="Save a channel from its player or card to see its schedule here."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {channels.map((ch) => {
            const slots = mockEpgFor(ch);
            return (
              <div
                key={ch.id}
                style={{
                  background: t.bgCard,
                  border: `1px solid ${t.border}`,
                  borderRadius: "14px",
                  padding: "14px",
                }}
              >
                <button
                  onClick={() => onOpenChannel(ch)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "transparent",
                    border: "none",
                    color: t.text,
                    marginBottom: "10px",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "8px",
                      background: t.accentDim,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: t.accent,
                      flexShrink: 0,
                    }}
                  >
                    <IconSignal width="16" height="16" />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>{ch.name}</span>
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {slots.map((slot, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "7px 8px",
                        borderRadius: "8px",
                        background: slot.live ? t.accentDim : "transparent",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontFamily: "'JetBrains Mono', monospace",
                          color: slot.live ? t.accent : t.textDim,
                          width: "40px",
                          flexShrink: 0,
                        }}
                      >
                        {slot.time}
                      </span>
                      <span style={{ fontSize: "12px", color: slot.live ? t.text : t.textDim, fontWeight: slot.live ? 600 : 400 }}>
                        {slot.title}
                      </span>
                      {slot.live && (
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "9px",
                            fontFamily: "'JetBrains Mono', monospace",
                            color: t.accent,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span className="ns-live-dot" style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
                          NOW
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- FAVORITES SCREEN ---------------- */
function FavoritesScreen({ t, channels, onOpenChannel, onToggleFavorite }) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Favorites</h2>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: t.textDim }}>
          {channels.length} saved channel{channels.length === 1 ? "" : "s"}
        </p>
      </div>

      {channels.length === 0 ? (
        <EmptyState
          t={t}
          icon={<IconHeart width="28" height="28" />}
          title="Nothing saved yet"
          subtitle="Tap the bookmark icon on a channel to add it here."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: "12px",
          }}
        >
          {channels.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              t={t}
              onClick={() => onOpenChannel(ch)}
              isFavorite={true}
              onToggleFavorite={() => onToggleFavorite(ch.id)}
              fullWidth
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- SETTINGS SCREEN ---------------- */
function SettingsScreen({
  t,
  mode,
  setMode,
  favoriteCount,
  playlistUrl,
  playlistDraft,
  setPlaylistDraft,
  playlistStatus,
  onLoadPlaylist,
  onClearPlaylist,
}) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Settings</h2>
      </div>

      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: "14px",
          padding: "4px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                background: t.accentDim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: t.accent,
              }}
            >
              {mode === "dark" ? <IconMoon /> : <IconSun />}
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>Appearance</div>
              <div style={{ fontSize: "11px", color: t.textDim }}>
                {mode === "dark" ? "Dark mode" : "Light mode"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}
            aria-label="Toggle light or dark mode"
            style={{
              width: "44px",
              height: "24px",
              borderRadius: "14px",
              background: t.accentDim,
              border: `1px solid ${t.borderStrong}`,
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "2px",
                left: mode === "dark" ? "22px" : "2px",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: t.accent,
                transition: "left 0.2s ease",
              }}
            />
          </button>
        </div>
      </div>

      {/* Custom M3U playlist source */}
      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: "14px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "9px",
              background: t.accentDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: t.accent,
              flexShrink: 0,
            }}
          >
            <IconLink />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Custom playlist</div>
            <div style={{ fontSize: "11px", color: t.textDim }}>Load channels from your own M3U link</div>
          </div>
        </div>

        {playlistUrl && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "12px",
              padding: "8px 10px",
              borderRadius: "8px",
              background: t.accentDim,
              border: `1px solid ${t.accent}`,
            }}
          >
            <span style={{ color: t.accent, display: "flex", flexShrink: 0 }}>
              <IconCheck />
            </span>
            <span
              style={{
                fontSize: "11px",
                color: t.accent,
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
            >
              {playlistUrl}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <input
            value={playlistDraft}
            onChange={(e) => setPlaylistDraft(e.target.value)}
            placeholder="https://example.com/playlist.m3u8"
            style={{
              flex: 1,
              background: t.bg,
              border: `1px solid ${playlistStatus === "error" ? "#FF6B5E" : t.border}`,
              borderRadius: "10px",
              padding: "10px 12px",
              fontSize: "12px",
              fontFamily: "'JetBrains Mono', monospace",
              color: t.text,
              outline: "none",
            }}
          />
        </div>

        {playlistStatus === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "8px", color: "#FF6B5E", fontSize: "11px" }}>
            <IconAlertTriangle />
            Doesn't look like a valid M3U link
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button
            onClick={onLoadPlaylist}
            disabled={!playlistDraft.trim() || playlistStatus === "loading"}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px",
              borderRadius: "10px",
              border: "none",
              background: t.accent,
              color: t.bg,
              fontSize: "12px",
              fontWeight: 700,
              opacity: !playlistDraft.trim() ? 0.5 : 1,
            }}
          >
            {playlistStatus === "loading" ? (
              <span style={{ display: "flex", animation: "nsSpin 0.8s linear infinite" }}>
                <IconRetry width="13" height="13" />
              </span>
            ) : (
              <IconLink width="13" height="13" />
            )}
            {playlistStatus === "loading" ? "Loading…" : "Use this playlist"}
          </button>
          {playlistUrl && (
            <button
              onClick={onClearPlaylist}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: `1px solid ${t.border}`,
                background: "transparent",
                color: t.textDim,
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              Reset to built-in
            </button>
          )}
        </div>

        <p style={{ fontSize: "10px", color: t.textDim, marginTop: "10px", lineHeight: 1.5 }}>
          {playlistUrl
            ? "Channels below are loaded from your playlist instead of the built-in iptv-org index."
            : "Leave empty to keep using the channels NorthStream ships with."}
        </p>
      </div>

      <div
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <SettingsRow t={t} label="Saved channels" value={String(favoriteCount)} />
        <SettingsRow t={t} label="Default video quality" value="Auto" />
        <SettingsRow
          t={t}
          label="Data source"
          value={playlistUrl ? "Custom playlist" : "iptv-org index"}
          last
        />
      </div>
    </div>
  );
}

function SettingsRow({ t, label, value, last }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px",
        borderBottom: last ? "none" : `1px solid ${t.border}`,
      }}
    >
      <span style={{ fontSize: "13px", color: t.text }}>{label}</span>
      <span style={{ fontSize: "12px", color: t.textDim, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function EmptyState({ t, icon, title, subtitle }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "60px 20px",
        color: t.textDim,
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "14px",
          color: t.accent,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "12px", maxWidth: "240px", lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  );
}

