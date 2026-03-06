/* BetterStart build v3.7-ytplayer-error-skip */
/* Goals:
   - Use YouTube Iframe API (already loaded in index.html)
   - Autoplay muted
   - Skip on ANY player error (codes 2/5/100/101/150) and if no PLAYING within a few seconds
   - Continue like a TV channel (never get stuck)
*/

const PLAYLIST_URL = "/.netlify/functions/playlist";
const REFRESH_URL  = "/.netlify/functions/refresh";

const START_TIMEOUT_MS = 5000;   // if not playing by then -> skip
const ERROR_SKIP_DELAY_MS = 600; // small delay before skipping after error
const END_BUFFER_MS = 800;       // jump slightly before end
const FALLBACK_ADVANCE_MS = 120000; // if duration unknown, advance every 2 min

let playlist = [];
let i = 0;

let player = null;
let muted = true;

let startTimer = null;
let endTimer = null;
let fallbackTimer = null;

const soundBtn = document.getElementById("soundBtn");
const bumper   = document.getElementById("bumper");
const nextUp   = document.getElementById("nextUp");
const nextUpTitle = document.getElementById("nextUpTitle");
const nextUpChannel = document.getElementById("nextUpChannel");

function log(...args){ console.log("[BetterStart]", ...args); }

function clearTimers(){
  if (startTimer) clearTimeout(startTimer);
  if (endTimer) clearTimeout(endTimer);
  if (fallbackTimer) clearTimeout(fallbackTimer);
  startTimer = endTimer = fallbackTimer = null;
}

function showBumper(show){
  if (!bumper) return;
  bumper.setAttribute("aria-hidden", show ? "false" : "true");
}

function showNextUp(item){
  if (!nextUp || !item) return;
  nextUpTitle && (nextUpTitle.textContent = item.title || "");
  nextUpChannel && (nextUpChannel.textContent = item.channel || "");
  nextUp.setAttribute("aria-hidden", "false");
  setTimeout(()=> nextUp.setAttribute("aria-hidden","true"), 1800);
}

function setSoundButton(){
  if (!soundBtn) return;
  soundBtn.textContent = muted ? "Muted" : "Sound";
  soundBtn.setAttribute("aria-pressed", muted ? "false" : "true");
}

if (soundBtn){
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    setSoundButton();
    if (player){
      if (muted) player.mute(); else player.unMute();
    }
  });
}

async function ensureTodayPlaylist(){
  // Try to refresh in the background (safe if already done)
  try { await fetch(REFRESH_URL, { cache:"no-store" }); } catch(e){}

  const res = await fetch(PLAYLIST_URL, { cache:"no-store" });
  const data = await res.json();
  playlist = Array.isArray(data.items) ? data.items.filter(v => v && v.videoId) : [];
  i = 0;
  log("playlist items:", playlist.length);
}

function current(){ return playlist[i]; }
function nextIndex(){ return (i + 1) % playlist.length; }
function nextItem(){ return playlist[nextIndex()]; }

function skip(reason){
  if (!playlist.length) return;
  log("skip:", reason);
  clearTimers();
  i = nextIndex();
  playCurrent(true);
}

function scheduleStartWatchdog(){
  clearTimeout(startTimer);
  startTimer = setTimeout(() => {
    // If we didn't reach PLAYING quickly, skip
    try {
      const st = player ? player.getPlayerState() : null;
      if (st !== YT.PlayerState.PLAYING){
        skip("start-timeout");
      }
    } catch(e){
      skip("start-timeout-ex");
    }
  }, START_TIMEOUT_MS);
}

function scheduleEnd(item){
  // Prefer durationSeconds from playlist (server sometimes includes)
  const dur = Number(item?.durationSeconds || 0);
  if (dur && Number.isFinite(dur) && dur > 5){
    clearTimeout(endTimer);
    endTimer = setTimeout(() => skip("ended-timer"), Math.max(4000, dur*1000 - END_BUFFER_MS));
  } else {
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => skip("fallback-advance"), FALLBACK_ADVANCE_MS);
  }
}

function playCurrent(force=false){
  if (!playlist.length) return;

  const item = current();
  const vid = item.videoId;

  // Show next up overlay
  showNextUp(nextItem());

  // Hide bumper shortly after we try to play
  showBumper(true);
  setTimeout(()=> showBumper(false), 900);

  clearTimers();
  scheduleStartWatchdog();
  scheduleEnd(item);

  if (!player){
    // Create player first time
    player = new YT.Player("ytplayer", {
      height: "100%",
      width: "100%",
      videoId: vid,
      playerVars: {
        autoplay: 1,
        playsinline: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        fs: 0,
        mute: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (e) => {
          try {
            e.target.mute();
            e.target.playVideo();
          } catch(_){}
        },
        onStateChange: (e) => {
          // If playing, cancel start watchdog
          if (e.data === YT.PlayerState.PLAYING){
            clearTimeout(startTimer);
            startTimer = null;
             showBumper(false);
          }
          // When ended, move on
          if (e.data === YT.PlayerState.ENDED){
            skip("ended");
          }
        },
        onError: (e) => {
          // Common embed errors: 2, 5, 100, 101, 150
          log("YT error:", e.data, "video:", vid);
          setTimeout(() => skip("yt-error-"+e.data), ERROR_SKIP_DELAY_MS);
        }
      }
    });
    setSoundButton();
  } else {
    // Load next video
    try {
      player.loadVideoById(vid);
      if (muted) player.mute(); else player.unMute();
      player.playVideo();
    } catch(e){
      // If something goes wrong, skip
      setTimeout(()=> skip("load-exception"), ERROR_SKIP_DELAY_MS);
    }
  }
}

// YouTube iframe API calls this when ready
window.onYouTubeIframeAPIReady = async function(){
  try{
    setSoundButton();
    await ensureTodayPlaylist();
    if (!playlist.length){
      showBumper(true);
      log("No playlist items.");
      return;
    }
    playCurrent(true);
  } catch(e){
    console.error(e);
    showBumper(true);
  }
};
