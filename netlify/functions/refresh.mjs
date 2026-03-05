import { getStore } from "@netlify/blobs";
import { ensureDailyPlaylist } from "./shared/daily.mjs";

export default async () => {
  try {
    const store = getStore("betterstart");
    const day = new Date().toISOString().slice(0, 10);
    const playlist = await ensureDailyPlaylist({ store, day });
    return new Response(JSON.stringify({ ok: true, day, picked: playlist.items.length }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
};
