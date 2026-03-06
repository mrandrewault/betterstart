const PLAYLIST_URL = "/.netlify/functions/playlist";
const REFRESH_URL = "/.netlify/functions/refresh";

let playlist = [];
let currentIndex = 0;
let player = null;
let isMuted = true;
let skipTimer = null;

const soundBtn = document.getElementById("soundBtn");
const bumper = document.getElementById("bumper");
const nextUp = document.getElementById("nextUp");
const nextUpTitle = document.getElementById("nextUpTitle");
const nextUpChannel = document.getElementById("nextUpChannel");

function hideBumper() {
  if (!bumper) return;
  bumper.style.display = "none";
  bumper.setAttribute("aria-hidden", "true");
}

function showBumper() {
  if (!bumper) return;
  bumper.style.display = "";
  bumper.setAttribute("aria-hidden", "false");
}

function updateSoundButton() {
  if (!soundBtn) return;
  soundBtn.textContent = isMuted ? "Muted" : "Sound On";
}

function clearSkipTimer() {
  if (skipTimer) {
    clearTimeout(skipTimer);
    skipTimer = null;
  }
}

function showNextUp() {
  if (!nextUp || !playlist.length) return;
  const nextIndex = (currentIndex + 1) % playlist.length;
  const nextItem = playlist[nextIndex];

  if (nextUpTitle) nextUpTitle.textContent = nextItem.title || "";
  if (nextUpChannel) nextUpChannel.textContent = nextItem.channelTitle || nextItem.channel || "";

  nextUp.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    nextUp.setAttribute("aria-hidden", "true");
  }, 1800);
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function loadPlaylist() {
  await fetch(REFRESH_URL, { cache: "no-store" }).catch(() => {});
  const res = await fetch(PLAYLIST_URL, { cache: "no-store" });
  const data = await res.json();

  const items = Array.isArray(data.items) ? data.items : [];
  playlist = shuffleArray(items.filter(item => item && item.videoId));

  currentIndex = 0;
}

function playCurrentVideo() {
  if (!playlist.length || !player) return;

  const item = playlist[currentIndex];
  if (!item || !item.videoId) return;

  clearSkipTimer();
  showBumper();
  showNextUp();

  try {
    player.loadVideoById(item.videoId);

    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }

    // If YouTube gets stuck or embed fails, skip after 5 seconds
    skipTimer = setTimeout(() => {
      nextVideo();
    }, 5000);
  } catch (err) {
    nextVideo();
  }
}

function nextVideo() {
  if (!playlist.length) return;
  clearSkipTimer();
  currentIndex = (currentIndex + 1) % playlist.length;
  playCurrentVideo();
}

window.onYouTubeIframeAPIReady = async function () {
  updateSoundButton();

  await loadPlaylist();

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
      origin: window.location.origin
    },
    events: {
      onReady: (event) => {
        event.target.mute();
        playCurrentVideo();
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) {
          clearSkipTimer();
          hideBumper();
        }

        if (event.data === YT.PlayerState.ENDED) {
          nextVideo();
        }
      },
      onError: () => {
        nextVideo();
      }
    }
  });
};

if (soundBtn) {
  soundBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    updateSoundButton();

    if (!player) return;

    if (isMuted) {
      player.mute();
    } else {
      player.unMute();
    }
  });
}
