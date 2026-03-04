import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { buildDailyPlaylist } from "./shared/generator.mjs";

export default async () => {
  const store = getStore("betterstart");
  const day = new Date().toISOString().slice(0, 10);
  const result = await buildDailyPlaylist({ store, day });
  return new Response(JSON.stringify({ ok: true, day, picked: result.items.length }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const config: Config = {
  schedule: "@daily",
};
