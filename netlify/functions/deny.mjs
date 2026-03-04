import { getStore } from "@netlify/blobs";
import { requireAdmin } from "./shared/auth.mjs";

export default async (req) => {
  const auth = requireAdmin(req);
  if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: auth.message }), { status: auth.status });

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await req.json().catch(() => null);
  const channelId = (body?.channelId || "").trim();
  if (!channelId) return new Response(JSON.stringify({ ok: false, error: "Missing channelId" }), { status: 400 });

  const store = getStore("betterstart");
  const candObj = (await store.get("candidates.json", { type: "json" }).catch(() => null)) || { items: [] };
  const newCands = (candObj.items || []).filter(c => c.channelId !== channelId);
  await store.setJSON("candidates.json", { items: newCands });

  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
};
