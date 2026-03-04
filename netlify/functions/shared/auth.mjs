export function requireAdmin(req) {
  const token = ((process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN) || "").trim();
  if (!token) {
    return { ok: false, status: 500, message: "ADMIN_TOKEN is not set on Netlify." };
  }
  const auth = req.headers.get("authorization") || "";
  const got = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (got !== token) {
    return { ok: false, status: 401, message: "Unauthorized. Missing/invalid token." };
  }
  return { ok: true };
}
