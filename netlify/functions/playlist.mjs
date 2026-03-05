import { getStore } from "@netlify/blobs";
import { ensureDailyPlaylist } from "./shared/daily.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const day = url.searchParams.get("day") || new Date().toISOString().slice(0, 10);

  const store = getStore("betterstart");
  const playlist = await ensureDailyPlaylist({ store, day });

  return new Response(JSON.stringify({ day, items: playlist.items }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};
