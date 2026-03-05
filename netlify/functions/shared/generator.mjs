/**
 * v3: Sources live in Netlify Blobs (sources.json), not hard-coded.
 * - Weekly discovery adds to candidates.json
 * - You approve candidates in /admin.html
 * - Daily playlist pulls RSS from approved sources
 * - Never repeats via seen.json
 */

export async function ensureTodayPlaylist({ store, day, size = 18 }) {
  const key = `daily/${day}.json`;
  const existing = await store.get(key, { type: "json" }).catch(() => null);
  if (existing?.items?.length) return existing;
  return await buildDailyPlaylist({ store, day, size });
}

function mixPlan(size) {
  const plan = {
    human: Math.round(size * 0.55),
    music: Math.round(size * 0.25),
    art: Math.round(size * 0.15),
    animals: Math.max(1, size - (Math.round(size * 0.55) + Math.round(size * 0.25) + Math.round(size * 0.15))),
  };
  let total = plan.human + plan.music + plan.art + plan.animals;
  while (total > size) { plan.human = Math.max(0, plan.human - 1); total--; }
  while (total < size) { plan.human++; total++; }
  return plan;
}

export function youtubeRssUrl(source) {
  if (source.type === "playlist") {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(source.id)}`;
  }
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(source.id)}`;
}

export async function buildDailyPlaylist({ store, day, size = 18 }) {
  const key = `daily/${day}.json`;

  // Load approved sources; bootstrap defaults if missing
  const sources = await getOrInitSources(store);

  // Load seen set
  const seenKey = "seen.json";
  const seenObj = (await store.get(seenKey, { type: "json" }).catch(() => null)) || { seen: [] };
  const seen = new Set(seenObj.seen || []);

  const buckets = { human: [], music: [], art: [], animals: [] };

  for (const src of sources) {
    const rss = youtubeRssUrl(src);
    const xml = await fetchWithTimeout(rss, 12000);
    if (!xml) continue;

    const entries = parseYouTubeRss(xml);
    for (const e of entries) {
      if (!e.videoId) continue;
      if (seen.has(e.videoId)) continue;

      const cat = src.category || "human";
      if (!buckets[cat]) buckets[cat] = [];
      buckets[cat].push({
        videoId: e.videoId,
        title: e.title || "",
        published: e.published || "",
        channel: src.name,
        category: cat,
      });
    }
  }

  // De-dupe, sort, shuffle per bucket
  for (const k of Object.keys(buckets)) {
    const uniq = new Map();
    for (const item of buckets[k]) {
      if (!uniq.has(item.videoId)) uniq.set(item.videoId, item);
    }
    buckets[k] = Array.from(uniq.values());
    buckets[k].sort((a, b) => (b.published || "").localeCompare(a.published || ""));
    buckets[k] = seededShuffle(buckets[k], hashString(day + ":" + k));
  }

  const plan = mixPlan(size);
  const picked = [];

  const pickFrom = (cat, n) => {
    const list = buckets[cat] || [];
    const take = list.splice(0, n);
    picked.push(...take);
  };

  pickFrom("human", plan.human);
  pickFrom("music", plan.music);
  pickFrom("art", plan.art);
  pickFrom("animals", plan.animals);

  if (picked.length < size) {
    const all = Object.values(buckets).flat();
    picked.push(...all.slice(0, size - picked.length));
  }

// Pick a larger candidate pool, then filter to embed-safe videos when possible.
const candidatePool = seededShuffle(picked, hashString(day)).slice(0, Math.max(size * 4, size));
let final = candidatePool;

// Optional: use YouTube Data API to remove videos that can't be embedded (and to avoid Shorts).
if (process.env.YOUTUBE_API_KEY && final.length) {
  try {
    const ids = final.map(v => v.videoId).slice(0, 50).join(",");
    const url = `https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=${ids}&key=${process.env.YOUTUBE_API_KEY}`;
    const data = (await fetchJsonWithTimeout(url, 12000)) || {};
    const ok = new Set();

    for (const it of (data.items || [])) {
      const emb = !!it?.status?.embeddable;
      const dur = isoDurationToSeconds(it?.contentDetails?.duration) || 0;
      // Skip Shorts-ish durations (<61s) to reduce embed failures & keep “TV” feel.
      if (emb && dur >= 61) ok.add(it.id);
    }

    final = final.filter(v => ok.has(v.videoId));
  } catch (e) {
    // If API fails, fall back to RSS-derived list (still works, may include some non-embeddables).
    console.log("Embed filter failed:", e?.message || e);
    final = candidatePool;
  }
}

final = final.slice(0, size);

// Persist seen

  for (const p of final) seen.add(p.videoId);
  const seenArr = Array.from(seen);
  const trimmed = seenArr.slice(Math.max(0, seenArr.length - 50000));
  await store.setJSON(seenKey, { seen: trimmed });

  const daily = { day, items: final };
  await store.setJSON(key, daily);
  return daily;
}

async function getOrInitSources(store) {
  const key = "sources.json";
  const existing = await store.get(key, { type: "json" }).catch(() => null);
  if (existing?.items?.length) return existing.items;

  // Default sources (your curated set)
  const defaults = [
    { name: "Sean Martinelli", category: "human", type: "channel", id: "UC9xnc0_xfpq-BenyBJMyKJA" },
    { name: "The Dodo", category: "animals", type: "channel", id: "UCINb0wqPz-A0dV9nARjJlOQ" },
    { name: "Great Big Story", category: "human", type: "channel", id: "UCajXeitgFL-rb5-gXI-aG8Q" },
    { name: "SoulPancake", category: "human", type: "channel", id: "UCaDVcGDMkvcRb4qGARkWlyg" },
    { name: "Yes Theory", category: "human", type: "channel", id: "UCvK4bOhULCpmLabd2pDMtnA" },

    { name: "COLORS", category: "music", type: "channel", id: "UC2Qw1dzXDBAZPwS7zm37g8g" },
    { name: "NPR Music (Tiny Desk)", category: "music", type: "channel", id: "UC4eYXhJI4-7wSWc8UNRwD4A" },

    { name: "Louisiana Channel", category: "art", type: "channel", id: "UCY2mhw-XNZSxrUynsI5K8Zw" },
    { name: "Art21", category: "art", type: "channel", id: "UC6Z_Gbfo7xwSMs6Ahkv-m3Q" },
    { name: "KQED Arts", category: "art", type: "channel", id: "UCS7Oxr5knNkZ8SlryFZnq0g" },

    { name: "StoryCorps (playlist)", category: "human", type: "playlist", id: "PLEn6CAtXKj7RL-or394eAgPMco0Vb8zKh" },
  ];

  await store.setJSON(key, { items: defaults });
  return defaults;
}

/** Minimal RSS parser **/
function parseYouTubeRss(xml) {
  const entries = [];
  const entryBlocks = xml.split("<entry>").slice(1);
  for (const block of entryBlocks) {
    const videoId = pickTag(block, "yt:videoId");
    const title = pickTag(block, "title");
    const published = pickTag(block, "published");
    entries.push({ videoId, title, published });
  }
  return entries;
}

function pickTag(block, tag) {
  const re = new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return decodeXml(m[1].trim());
}

function decodeXml(s) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function fetchJsonWithTimeout(url, ms) {
  return fetchWithTimeout(url, ms).then((txt) => {
    if (!txt) return null;
    try { return JSON.parse(txt); } catch { return null; }
  });
}

function isoDurationToSeconds(iso) {
  // ISO 8601 duration, e.g. PT4M13S
  if (!iso || typeof iso !== "string") return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const mi = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + mi * 60 + s;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
