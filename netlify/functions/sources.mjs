import { getStore } from "@netlify/blobs";
import { requireAdmin } from "./shared/auth.mjs";

export default async (req) => {
  const auth = requireAdmin(req);
  if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: auth.message }), { status: auth.status });

  const store = getStore("betterstart");
  const obj = (await store.get("sources.json", { type: "json" }).catch(() => null)) || { items: [] };
  return new Response(JSON.stringify({ ok: true, items: obj.items || [] }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
