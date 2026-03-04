import { getStore } from "@netlify/blobs";
import { buildDailyPlaylist } from "./shared/generator.mjs";

export default async () => {
  try {
    const store = getStore("betterstart");
    const day = new Date().toISOString().slice(0, 10);
    const result = await buildDailyPlaylist({ store, day });
    return new Response(JSON.stringify({ ok: true, day, picked: result.items.length }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(err?.message || err),
      hint: "Netlify → Logs & metrics → Function logs → refresh"
    }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
};
