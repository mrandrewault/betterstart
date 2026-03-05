import { getStore } from "@netlify/blobs";

const BAD_WORDS = [
  "prank","pranks",
  "politics","political","election","campaign",
  "breaking news","news","cnn","fox","msnbc",
  "sermon","church","jesus","christian","islam","quran","bible",
];

// Build (or return) a day's playlist using YouTube Data API (more reliable than RSS on serverless).
export async function ensureDailyPlaylist({ store, day }) {
  const keyName = `daily/${day}.json`;
  const existing = await store.get(keyName, { type: "json" }).catch(() => null);
  if (existing && Array.isArray(existing.items) && existing.items.length) return existing;

  const built = await buildDailyPlaylistViaAPI({ store, day });
  await store.setJSON(keyName, built);
  return built;
}

async function buildDailyPlaylistViaAPI({ store, day }) {
  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  if (!apiKey) throw new Error("Missing YOUTUBE_API_KEY in Netlify Environment variables.");

  const sourcesObj = await store.get("sources.json", { type: "json" }).catch(() => ({ items: [] }));
  const sources = sourcesObj?.items || [];

  const seenObj = await store.get("seen.json", { type: "json" }).catch(() => ({ ids: [] }));
  const seen = new Set(seenObj?.ids || []);

  const pool = [];
  const perSourceTarget = 60; // pull up to ~60 videos per channel (with pagination)
  for (const s of sources) {
    if (s.type !== "channel") continue;
    const vids = await fetchLatestVideosForChannel(apiKey, s.id, perSourceTarget);
    for (const v of vids) {
      const blob = ((v.title||"") + " " + (v.description||"") + " " + (v.channelTitle||"")).toLowerCase();
      if (BAD_WORDS.some(w => blob.includes(w))) continue;
      pool.push({
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle,
        publishedAt: v.publishedAt,
        source: { type: s.type, id: s.id, name: s.name || v.channelTitle || "", category: s.category || "human" },
      });
    }
  }

  // Remove duplicates and already-seen
  const uniq = new Map();
  for (const it of pool) {
    if (!it.videoId) continue;
    if (seen.has(it.videoId)) continue;
    if (!uniq.has(it.videoId)) uniq.set(it.videoId, it);
  }

  const candidates = Array.from(uniq.values());
  shuffleInPlace(candidates);

  // Pick a solid amount; app consumes as many as provided
  const picked = candidates.slice(0, 25);

  // Update seen
  for (const p of picked) seen.add(p.videoId);
  await store.setJSON("seen.json", { ids: Array.from(seen).slice(-50000) });

  return { day, items: picked };
}

async function fetchLatestVideosForChannel(apiKey, channelId, limit) {
  const out = [];
  let pageToken = "";
  while (out.length < limit) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("order", "date");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("safeSearch", "strict");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    const txt = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`YouTube API search failed ${res.status}: ${txt.slice(0, 200)}`);
    const data = JSON.parse(txt);
    const items = data.items || [];
    for (const it of items) {
      const sn = it.snippet || {};
      out.push({
        videoId: it?.id?.videoId || "",
        title: sn.title || "",
        description: sn.description || "",
        channelTitle: sn.channelTitle || "",
        publishedAt: sn.publishedAt || "",
      });
      if (out.length >= limit) break;
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
