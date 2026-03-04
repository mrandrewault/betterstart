import { getStore } from "@netlify/blobs";

const DEFAULT_QUERIES = [
  "great big story short documentary",
  "human interest mini documentary",
  "artist profile short documentary",
  "music performance live session",
  "culture mini doc",
  "uplifting true story documentary",
  "street art documentary",
  "creative community documentary",
  "tiny desk style live performance",
  "animated true story interview",
];

const BAD_WORDS = [
  "prank","pranks",
  "politics","political","election","campaign",
  "breaking news","news","cnn","fox","msnbc",
  "sermon","church","jesus","christian","islam","quran","bible",
];

export default async () => {
  try {
    const key = (process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || "").trim();
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: "Missing YOUTUBE_API_KEY (Netlify env var)." }), { status: 500 });
    }

    const store = getStore("betterstart");

    const sources = (await store.get("sources.json", { type: "json" }).catch(() => null))?.items || [];
    const approvedIds = new Set(sources.map(s => s.type + ":" + s.id));

    const candObj = (await store.get("candidates.json", { type: "json" }).catch(() => null)) || { items: [] };
    const existingCands = new Map((candObj.items || []).map(c => [c.channelId, c]));

    const discovered = [];
    for (const q of DEFAULT_QUERIES) {
      const results = await youtubeSearch(key, q, 25);
      for (const r of results) {
        const channelId = r.channelId;
        const name = r.channelTitle;

        if (!channelId) continue;
        if (approvedIds.has("channel:" + channelId)) continue;
        if (existingCands.has(channelId)) continue;

        const blob = (name + " " + (r.title||"") + " " + (r.description||"")).toLowerCase();
        if (BAD_WORDS.some(w => blob.includes(w))) continue;

        discovered.push({
          channelId,
          name: name || "Unknown",
          description: r.description || "",
          query: q,
          sampleVideoId: r.videoId || "",
          discoveredAt: new Date().toISOString(),
        });

        if (discovered.length >= 60) break;
      }
      if (discovered.length >= 60) break;
    }

    const merged = [...(candObj.items || []), ...discovered];
    const uniq = new Map();
    for (const c of merged) uniq.set(c.channelId, c);
    const final = Array.from(uniq.values()).slice(0, 500);

    await store.setJSON("candidates.json", { items: final });

    return new Response(JSON.stringify({ ok: true, added: discovered.length, total: final.length }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500 });
  }
};

async function youtubeSearch(apiKey, query, maxResults) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(Math.min(maxResults, 50)));
  url.searchParams.set("q", query);
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("YouTube search failed: " + res.status + " " + txt.slice(0, 200));
  }
  const data = await res.json();
  const items = data.items || [];
  return items.map(it => ({
    videoId: it?.id?.videoId || "",
    channelId: it?.snippet?.channelId || "",
    channelTitle: it?.snippet?.channelTitle || "",
    title: it?.snippet?.title || "",
    description: it?.snippet?.description || "",
  }));
}

export const config = { schedule: "0 3 * * 1" };
