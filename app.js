const FEED = document.getElementById("feed");
const SOUND_BTN = document.getElementById("soundBtn");
const PLAYER_MOUNT = document.getElementById("playerMount");
const BUMPER = document.getElementById("bumper");
const NEXT_UP = document.getElementById("nextUp");
const NEXT_UP_TITLE = document.getElementById("nextUpTitle");
const NEXT_UP_CHANNEL = document.getElementById("nextUpChannel");

let playlist = [];
let activeIndex = -1;
let player = null;
let apiReady = false;
let isMuted = true;

let progressTimer = null;
let watchdogTimer = null;
let lastLoadAt = 0;

// Build a thumbnail URL from YouTube videoId
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// Deterministic day key (local device is fine for the feel)
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadPlaylist() {
  const day = todayKey();
  const res = await fetch(`/.netlify/functions/playlist?day=${encodeURIComponent(day)}`, {
    headers: { "Accept": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status}`);
  const data = await res.json();
  playlist = data.items || [];
}

function renderFeed() {
  FEED.innerHTML = "";
  playlist.forEach((v, idx) => {
    const card = document.createElement("section");
    card.className = "card";
    card.dataset.index = String(idx);

    card.innerHTML = `
      <div class="frame">
        <div class="progressWrap"><div class="progressBar" id="progress-${idx}"></div></div>
        <div class="ytSlot" id="ytSlot-${idx}"></div>
        <div class="poster" id="poster-${idx}">
          <img src="${thumb(v.videoId)}" alt="" loading="lazy" />
        </div>
        <div class="hint">Autoplay (muted)</div>
        <div class="meta">
          <div class="title">${escapeHtml(v.title || "Untitled")}</div>
          <div class="channel">${escapeHtml(v.channel || "")}</div>
        </div>
      </div>
    `;
    FEED.appendChild(card);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function observeCards() {
  const cards = [...document.querySelectorAll(".card")];
  const io = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    const idx = Number(visible.target.dataset.index);
    if (Number.isFinite(idx)) setActive(idx);
  }, { root: FEED, threshold: [0.55, 0.7, 0.85, 0.95] });

  cards.forEach(c => io.observe(c));
}

function mountPlayerIntoSlot(index) {
  const slot = document.getElementById(`ytSlot-${index}`);
  if (!slot) return;

  slot.appendChild(PLAYER_MOUNT);
  PLAYER_MOUNT.classList.add("active");

  // Hide poster for active card; show others
  playlist.forEach((_, i) => {
    const p = document.getElementById(`poster-${i}`);
    if (p) p.style.display = (i === index) ? "none" : "";
  });
}

function setActive(index) {
  if (index === activeIndex) return;
  activeIndex = index;

  mountPlayerIntoSlot(index);

  if (!apiReady || !player) return;

  const vid = playlist[index]?.videoId;
  if (!vid) return;

  try {
    if (isMuted) player.mute(); else player.unMute();
    player.loadVideoById({ videoId: vid, startSeconds: 0 });
    resetProgressBars();
    startProgressLoop();
    armWatchdog();
  } catch (e) {
    console.warn(e);
  }
}

function resetProgressBars() {
  playlist.forEach((_, i) => {
    const bar = document.getElementById(`progress-${i}`);
    if (bar) bar.style.width = "0%";
  });
}

function startProgressLoop() {
  stopProgressLoop();
  progressTimer = setInterval(() => {
    if (!player || activeIndex < 0) return;
    let dur = 0;
    let cur = 0;
    try {
      dur = player.getDuration?.() || 0;
      cur = player.getCurrentTime?.() || 0;
    } catch { return; }
    if (!dur) return;
    const pct = Math.max(0, Math.min(1, cur / dur)) * 100;
    const bar = document.getElementById(`progress-${activeIndex}`);
    if (bar) bar.style.width = `${pct.toFixed(2)}%`;
  }, 250);
}

function stopProgressLoop() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
}

function showNextUp() {
  const next = Math.min(activeIndex + 1, playlist.length - 1);
  if (next === activeIndex) return;
  NEXT_UP_TITLE.textContent = playlist[next]?.title || "";
  NEXT_UP_CHANNEL.textContent = playlist[next]?.channel || "";
  NEXT_UP.classList.add("show");
  NEXT_UP.setAttribute("aria-hidden", "false");
}

function hideNextUp() {
  NEXT_UP.classList.remove("show");
  NEXT_UP.setAttribute("aria-hidden", "true");
}



function clearWatchdog() {
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = null;
}

function armWatchdog() {
  clearWatchdog();
  lastLoadAt = Date.now();
  // If a video can't play (embed blocked / restricted / Shorts), YouTube may show an error overlay.
  // We can't read the overlay, so we skip forward if we don't reach PLAYING quickly.
  watchdogTimer = setTimeout(() => {
    try {
      const state = player?.getPlayerState?.();
      if (state !== YT.PlayerState.PLAYING) {
        skipToNext("watchdog");
      }
    } catch {
      skipToNext("watchdog");
    }
  }, 4500);
}

function skipToNext(reason = "error") {
  stopProgressLoop();
  hideNextUp();

  const next = (activeIndex >= 0) ? Math.min(activeIndex + 1, playlist.length - 1) : 0;
  if (next === activeIndex) return;

  const nextCard = document.querySelector(`.card[data-index="${next}"]`);
  if (nextCard) nextCard.scrollIntoView({ behavior: "smooth", block: "start" });

  // Fallback if scroll didn't trigger intersection quickly:
  setTimeout(() => {
    setActive(next);
  }, 350);
}

// YouTube IFrame API callback (must be global)
window.onYouTubeIframeAPIReady = () => {
  apiReady = true;

  player = new YT.Player("ytplayer", {
    width: "100%",
    height: "100%",
    videoId: playlist[0]?.videoId || "",
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      mute: 1,
      enablejsapi: 1,
      fs: 0,
      iv_load_policy: 3,
    },
    events: {
      onReady: () => {
        try {
          player.mute();
          isMuted = true;
          updateSoundBtn();
        } catch {}

        const idx = activeIndex >= 0 ? activeIndex : 0;
        setActive(idx);
      },
      onStateChange: (e) => {
        // 0 ended, 1 playing, 2 paused
        if (e.data === YT.PlayerState.PLAYING) {
          clearWatchdog();
          hideNextUp();
          startProgressLoop();
        }
        if (e.data === YT.PlayerState.ENDED) {
          clearWatchdog();
          showNextUp();
          stopProgressLoop();
          const next = Math.min(activeIndex + 1, playlist.length - 1);
          if (next !== activeIndex) {
            const nextCard = document.querySelector(`.card[data-index="${next}"]`);
            if (nextCard) nextCard.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      },
      onError: (e) => {
        console.log('YT error', e?.data);
        skipToNext('onError');
      }
    }
  });
};

function updateSoundBtn() {
  SOUND_BTN.textContent = isMuted ? "Muted" : "Sound On";
  SOUND_BTN.setAttribute("aria-pressed", String(!isMuted));
}

SOUND_BTN.addEventListener("click", () => {
  isMuted = !isMuted;
  updateSoundBtn();
  if (!player) return;
  try {
    if (isMuted) player.mute();
    else player.unMute();
  } catch {}
});

async function init() {
  await loadPlaylist();
  if (!playlist.length) {
    FEED.innerHTML = '<div class="loading">No videos found for today yet.</div>';
    return;
  }
  renderFeed();
  observeCards();

  // Start at the top
  activeIndex = 0;
  mountPlayerIntoSlot(0);

  // Bumper: show for ~1.8s then fade
  setTimeout(() => {
    BUMPER.classList.add("hidden");
    BUMPER.setAttribute("aria-hidden", "true");
  }, 1800);
}

init();
