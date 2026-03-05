// Better Start — simple “TV channel” player (embed-safe + auto-skip)
// Drop-in replacement for app.js

const SITE_ORIGIN = location.origin;
const PLAYLIST_URL = `${SITE_ORIGIN}/.netlify/functions/playlist`;
const FALLBACK_SKIP_MS = 4500; // if video doesn't start, skip
const MIN_ITEMS = 5;

let items = [];
let idx = 0;
let muted = true;
let skipTimer = null;
let startedAt = 0;

const iframe = document.getElementById("player");
const muteBtn = document.getElementById("muteBtn");
const nextBtn = document.getElementById("nextBtn");

// --- UI wiring ---
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "Unmute" : "Mute";
    // reload current video with new mute state (fast + reliable)
    playCurrent(true);
  });
}
if (nextBtn) nextBtn.addEventListener("click", () => next(true));

// --- Core helpers ---
function ytEmbedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
    mute: muted ? "1" : "0",
    enablejsapi: "1",
    origin: SITE_ORIGIN,
  });
  // nocookie helps with some privacy/tracking blockers
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function clearSkipTimer() {
  if (skipTimer) clearTimeout(skipTimer);
  skipTimer = null;
}

function armSkipTimer() {
  clearSkipTimer();
  startedAt = Date.now();

  // We can't “read” inside the YouTube iframe (cross-domain),
  // so we use a timeout failover: if we don't see progress, skip.
  skipTimer = setTimeout(() => {
    // If we've been on this video long enough and still likely stuck, skip
    next(true);
  }, FALLBACK_SKIP_MS);
}

function setIframe(videoId) {
  iframe.src = ytEmbedUrl(videoId);

  // If iframe finishes loading but video is blocked, YouTube shows an error screen.
  // We can't detect it directly, so we arm a skip timer and keep the channel moving.
  armSkipTimer();
}

function current() {
  return items[idx];
}

function next(force = false) {
  if (!items.length) return;
  idx = (idx + 1) % items.length;
  playCurrent(force);
}

function playCurrent(force = false) {
  const it = current();
  if (!it || !it.videoId) return;

  // Avoid reloading too aggressively unless user clicked Next / toggled mute
  if (!force && iframe.src.includes(it.videoId)) return;

  setIframe(it.videoId);
  // Mark “progress” a bit later; if user sees motion/audio they can keep watching.
  // If video is actually playing, user won't notice the timer because it will be reset
  // when we schedule the approximate end fallback below.
  scheduleApproxEndFallback(it);
}

function scheduleApproxEndFallback(it) {
  // Best-effort: if durationSeconds exists, move to next near the end.
  // (If we don't have duration, the skip-timer still prevents getting stuck.)
  const dur = Number(it.durationSeconds || 0);
  if (!dur || !Number.isFinite(dur)) return;

  // If a video is long, we don't want to auto-next too early.
  // Wait until near the end; keep a small buffer.
  const ms = Math.max(15000, (dur - 2) * 1000);

  clearSkipTimer();
  skipTimer = setTimeout(() => {
    next(false);
  }, ms);
}

async function loadPlaylist() {
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status}`);
  const data = await res.json();

  const got = Array.isArray(data.items) ? data.items : [];
  // keep only items with a videoId
  items = got.filter(v => v && v.videoId);
  idx = 0;

  if (items.length < MIN_ITEMS) {
    throw new Error(`Playlist has only ${items.length} playable items.`);
  }
}

// --- Boot ---
(async function boot() {
  try {
    // Start muted by default (browser autoplay rules)
    if (muteBtn) muteBtn.textContent = "Unmute";

    await loadPlaylist();
    playCurrent(true);

    // Helpful: if user returns to tab later and it's stuck, nudge it forward
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        // If we've been on the same screen a long time, try next
        if (Date.now() - startedAt > 20000) next(false);
      }
    });

  } catch (err) {
    console.error(err);
    // Minimal friendly fallback
    const msg = document.createElement("div");
    msg.style.position = "fixed";
    msg.style.inset = "0";
    msg.style.display = "grid";
    msg.style.placeItems = "center";
    msg.style.color = "white";
    msg.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    msg.style.textAlign = "center";
    msg.innerHTML = `
      <div style="max-width:520px;padding:20px;">
        <h1 style="margin:0 0 10px;font-size:28px;">Better Start</h1>
        <p style="opacity:.85;margin:0 0 14px;">Couldn’t load today’s channel.</p>
        <p style="opacity:.6;margin:0;font-size:12px;">${String(err.message || err)}</p>
      </div>`;
    document.body.appendChild(msg);
  }
})();
