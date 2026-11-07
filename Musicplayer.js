/* =========================================================
   Nightwave — Spotify-inspired premium music player
   Vanilla JS. No frameworks.
   ========================================================= */

/* ---------- Playlist data ----------
   Each track: { title, artist, src, image }
   Add/remove tracks here — everything else adapts automatically. */
const tracks = [
  {
    title: "TVK flag anthem",
    artist: "TVK VIJAY",
    src: "songs/Tamilaga Vettri Kazhagam- Flag Anthem.mp3",
    image: "images/Tamilaga Vetri Kalagam Flag.jpg"
  },
  {
    title: "TVK ideology song",
    artist: "sri",
    src: "songs/Tamilaga Vettri Kazhagam- Ideology Song.mp3",
    image: "images/TVK Poster _ Aalaporaan…Thamizan _ CM Thalapathy Vijay.jpg"
  },
  {
    title: "TVK unga vijay",
    artist: "TVK VIJAY",
    src: "songs/உங்க விஜய், நா வரேன்!.mp3",
    image: "images/11329436558011126.jpg"
  },
  {
    title: "TVK campaign song",
    artist: "TVK VIJAY",
    src: "songs/TVK ELECTION CAMPAIGN SONG.mp3",
    image: "images/TVK Vijay.jpg"
  }
];

/* ---------- Player state ---------- */
let current = 0;
let isPlaying = false;
let shuffleOn = false;
let repeatMode = "off"; // "off" | "all" | "one"
let playOrder = tracks.map((_, i) => i);
let filteredIndices = tracks.map((_, i) => i);
let favorites = new Set();
let audioCtx, analyser, sourceNode, rafId;
let activeBackdrop = "A"; // tracks which crossfade layer is currently visible

/* ---------- DOM references ---------- */
const audio = document.getElementById("audio");
const playlistEl = document.getElementById("playlist");
const playBtn = document.getElementById("playBtn");
const playIcon = document.getElementById("playIcon");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");
const repeatOneDot = document.getElementById("repeatOneDot");
const progress = document.getElementById("progress");
const volume = document.getElementById("volume");
const autoplay = document.getElementById("autoplay");
const trackTitle = document.getElementById("trackTitle");
const trackArtist = document.getElementById("trackArtist");
const trackIndex = document.getElementById("trackIndex");
const statusFlag = document.getElementById("statusFlag");
const timeCurrent = document.getElementById("timeCurrent");
const timeDuration = document.getElementById("timeDuration");
const platter = document.getElementById("platter");
const tonearm = document.getElementById("tonearm");
const glowRing = document.getElementById("glowRing");
const albumArt = document.getElementById("albumArt");
const onAir = document.getElementById("onAir");
const onAirLabel = document.getElementById("onAirLabel");
const topbarTitle = document.getElementById("topbarTitle");
const visualizer = document.getElementById("visualizer");
const visualizerBars = [...visualizer.querySelectorAll("span")];
const searchInput = document.getElementById("search");
const playlistCount = document.getElementById("playlistCount");
const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const backdropA = document.getElementById("backdropA");
const backdropB = document.getElementById("backdropB");

/* ---------- Icon markup ---------- */
const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
const STAR_OUTLINE = '<path d="M12 2l2.9 6.5 7.1.6-5.4 4.7 1.7 7L12 17.3 5.7 20.8l1.7-7L2 9.1l7.1-.6L12 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';
const STAR_FILLED = '<path d="M12 2l2.9 6.5 7.1.6-5.4 4.7 1.7 7L12 17.3 5.7 20.8l1.7-7L2 9.1l7.1-.6L12 2z"/>';

/* =========================================================
   Local storage — remembers volume, last track, favorites,
   shuffle state and repeat mode across visits.
   ========================================================= */
function safeStorage() {
  try {
    localStorage.setItem("__t", "1");
    localStorage.removeItem("__t");
    return true;
  } catch (e) {
    return false;
  }
}
const hasStorage = safeStorage();

function loadPrefs() {
  if (!hasStorage) return;
  try {
    const savedVol = localStorage.getItem("nightwave:volume");
    if (savedVol !== null) volume.value = savedVol;

    const savedFavs = JSON.parse(localStorage.getItem("nightwave:favorites") || "[]");
    favorites = new Set(savedFavs);

    const savedIndex = parseInt(localStorage.getItem("nightwave:lastTrack"), 10);
    if (!isNaN(savedIndex) && savedIndex >= 0 && savedIndex < tracks.length) current = savedIndex;

    const savedShuffle = localStorage.getItem("nightwave:shuffle");
    shuffleOn = savedShuffle === "true";

    const savedRepeat = localStorage.getItem("nightwave:repeat");
    if (savedRepeat === "off" || savedRepeat === "all" || savedRepeat === "one") repeatMode = savedRepeat;
  } catch (e) {
    /* ignore corrupt storage */
  }
}

function savePrefs() {
  if (!hasStorage) return;
  localStorage.setItem("nightwave:volume", volume.value);
  localStorage.setItem("nightwave:favorites", JSON.stringify([...favorites]));
  localStorage.setItem("nightwave:lastTrack", String(current));
  localStorage.setItem("nightwave:shuffle", String(shuffleOn));
  localStorage.setItem("nightwave:repeat", repeatMode);
}

/* ---------- Helpers ---------- */
function fmt(sec) {
  if (!isFinite(sec) || sec == null) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rebuildOrder() {
  const base = tracks.map((_, i) => i);
  playOrder = shuffleOn ? shuffleArray(base) : base;
}

function orderPosition(i) {
  return playOrder.indexOf(i);
}

/* Small ripple animation on any .btn click, purely decorative */
function addRipple(btn, evt) {
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  const x = (evt.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
  const y = (evt.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  btn.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
}
document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("click", (e) => addRipple(btn, e));
});

/* =========================================================
   Blurred backdrop crossfade — swaps between two absolutely
   positioned layers so the transition fades smoothly.
   ========================================================= */
function setBackdrop(imageUrl) {
  const showLayer = activeBackdrop === "A" ? backdropB : backdropA;
  const hideLayer = activeBackdrop === "A" ? backdropA : backdropB;
  showLayer.style.backgroundImage = `url("${imageUrl}")`;
  showLayer.classList.add("visible");
  hideLayer.classList.remove("visible");
  activeBackdrop = activeBackdrop === "A" ? "B" : "A";
}

/* =========================================================
   Playlist rendering
   ========================================================= */
function buildPlaylist() {
  const q = searchInput.value.trim().toLowerCase();
  filteredIndices = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !q || t.title.toLowerCase().includes(q))
    .map(({ i }) => i);

  playlistCount.textContent = `${filteredIndices.length} / ${tracks.length}`;
  playlistEl.innerHTML = "";

  if (filteredIndices.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No songs match your search.";
    playlistEl.appendChild(empty);
    return;
  }

  filteredIndices.forEach((i) => {
    const t = tracks[i];
    const isActive = i === current;

    const card = document.createElement("div");
    card.className = "track-card" + (isActive ? " active" : "") + (t.errored ? " errored" : "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Play ${t.title} by ${t.artist}`);
    card.dataset.index = i;

    card.innerHTML = `
      <div class="card-art">
        <img src="${t.image}" alt="" loading="lazy">
        <div class="playing-indicator" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
      <div class="card-info">
        <div class="card-title">${t.title}</div>
        <div class="card-artist">${t.artist}</div>
      </div>
      <div class="card-dur">${t.errored ? "n/a" : t.durationLabel || "--:--"}</div>
    `;

    const fav = document.createElement("button");
    fav.className = "fav-btn" + (favorites.has(i) ? " on" : "");
    fav.setAttribute("aria-label", favorites.has(i) ? "Remove from favorites" : "Add to favorites");
    fav.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${favorites.has(i) ? STAR_FILLED : STAR_OUTLINE}</svg>`;

    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      favorites.has(i) ? favorites.delete(i) : favorites.add(i);
      fav.classList.add("bump");
      fav.addEventListener("animationend", () => fav.classList.remove("bump"), { once: true });
      savePrefs();
      buildPlaylist();
    });

    const playFromCard = () => {
      current = i;
      loadTrack(current);
      playTrack();
    };
    card.addEventListener("click", playFromCard);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playFromCard();
      }
    });

    card.appendChild(fav);
    playlistEl.appendChild(card);
  });

  scrollToActiveCard();
}

/* Keeps the currently playing song visible in the scrollable list */
function scrollToActiveCard() {
  const activeCard = playlistEl.querySelector(".track-card.active");
  if (activeCard) {
    activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/* ---------- Status flag (e.g. load errors) ---------- */
function setStatusFlag(message) {
  if (message) {
    statusFlag.textContent = message;
    statusFlag.hidden = false;
  } else {
    statusFlag.hidden = true;
  }
}

/* ---------- OS-level media controls (lock screen / hardware keys) ---------- */
function updateMediaSession(t) {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: "Nightwave",
      artwork: [{ src: t.image }]
    });
    navigator.mediaSession.setActionHandler("play", playTrack);
    navigator.mediaSession.setActionHandler("pause", pauseTrack);
    navigator.mediaSession.setActionHandler("previoustrack", prevTrack);
    navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
  }
}

/* =========================================================
   Track loading — swaps audio source, album art and backdrop
   ========================================================= */
function loadTrack(i) {
  const t = tracks[i];

  audio.pause();
  audio.src = t.src;
  audio.load();

  albumArt.style.opacity = 0;
  const img = new Image();
  img.onload = () => {
    albumArt.src = t.image;
    albumArt.style.opacity = 1;
  };
  img.onerror = () => {
    albumArt.src = t.image; // let the <img> element show its own broken state
    albumArt.style.opacity = 1;
  };
  img.src = t.image;

  setBackdrop(t.image);

  trackTitle.textContent = t.title;
  trackArtist.textContent = t.artist;
  trackIndex.textContent = `Track ${(i + 1).toString().padStart(2, "0")} / ${tracks.length.toString().padStart(2, "0")}`;
  topbarTitle.textContent = `${t.title} — ${t.artist}`;

  progress.value = 0;
  timeCurrent.textContent = "0:00";
  timeDuration.textContent = t.durationLabel || "0:00";
  setStatusFlag(t.errored ? "Can't load this track" : null);
  platter.classList.toggle("errored", !!t.errored);

  updateMediaSession(t);
  buildPlaylist();
  savePrefs();
}

/* =========================================================
   Web Audio API visualizer
   ========================================================= */
function ensureAnalyser() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  } catch (e) {
    /* Web Audio unavailable — visualizer simply won't animate */
  }
}

function animateVisualizer() {
  if (!analyser) {
    rafId = requestAnimationFrame(animateVisualizer);
    return;
  }
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  visualizerBars.forEach((bar, idx) => {
    const v = data[idx % data.length] || 0;
    bar.style.height = `${Math.max(4, (v / 255) * 30)}px`;
  });
  rafId = requestAnimationFrame(animateVisualizer);
}

/* =========================================================
   Transport controls
   ========================================================= */
function playTrack() {
  ensureAnalyser();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

  audio
    .play()
    .then(() => {
      isPlaying = true;
      playIcon.innerHTML = ICON_PAUSE;
      playBtn.setAttribute("aria-label", "Pause");
      platter.classList.add("spinning");
      tonearm.classList.add("down");
      glowRing.classList.add("active");
      onAir.classList.add("live");
      onAirLabel.textContent = "On Air";
      visualizer.classList.add("active");
      if (!rafId) animateVisualizer();
      buildPlaylist();
    })
    .catch(() => {
      markCurrentErrored();
    });
}

function pauseTrack() {
  audio.pause();
  isPlaying = false;
  playIcon.innerHTML = ICON_PLAY;
  playBtn.setAttribute("aria-label", "Play");
  platter.classList.remove("spinning");
  tonearm.classList.remove("down");
  glowRing.classList.remove("active");
  onAir.classList.remove("live");
  onAirLabel.textContent = "Standby";
  visualizer.classList.remove("active");
}

function togglePlay() {
  isPlaying ? pauseTrack() : playTrack();
}

function nextTrack() {
  if (playOrder.length === 0) return;
  const pos = orderPosition(current);
  const nextPos = (pos + 1) % playOrder.length;
  current = playOrder[nextPos];
  loadTrack(current);
  if (isPlaying) playTrack();
}

function prevTrack() {
  if (playOrder.length === 0) return;
  const pos = orderPosition(current);
  const prevPos = (pos - 1 + playOrder.length) % playOrder.length;
  current = playOrder[prevPos];
  loadTrack(current);
  if (isPlaying) playTrack();
}

/* Marks a track as broken, informs the user, and skips ahead
   to the next playable track rather than stalling the player. */
function markCurrentErrored() {
  tracks[current].errored = true;
  setStatusFlag("Can't load this track — skipping");
  platter.classList.add("errored");
  progress.disabled = true;
  buildPlaylist();
  setTimeout(() => {
    progress.disabled = false;
    if (filteredIndices.some((i) => !tracks[i].errored)) {
      nextTrack();
    } else {
      pauseTrack();
    }
  }, 900);
}

/* =========================================================
   Event wiring
   ========================================================= */
shuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle("on", shuffleOn);
  shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
  rebuildOrder();
  savePrefs();
});

repeatBtn.addEventListener("click", () => {
  repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
  repeatBtn.classList.toggle("on", repeatMode !== "off");
  repeatOneDot.hidden = repeatMode !== "one";
  repeatBtn.setAttribute("aria-label", `Repeat ${repeatMode}`);
  savePrefs();
});

playBtn.addEventListener("click", togglePlay);
nextBtn.addEventListener("click", nextTrack);
prevBtn.addEventListener("click", prevTrack);

audio.addEventListener("loadedmetadata", () => {
  timeDuration.textContent = fmt(audio.duration);
  progress.max = audio.duration || 100;
  tracks[current].durationLabel = fmt(audio.duration);
  buildPlaylist();
});

audio.addEventListener("error", () => {
  if (audio.getAttribute("src")) markCurrentErrored();
});

audio.addEventListener("timeupdate", () => {
  if (!isNaN(audio.duration)) {
    progress.value = audio.currentTime;
    timeCurrent.textContent = fmt(audio.currentTime);
  }
});

progress.addEventListener("input", () => {
  audio.currentTime = progress.value;
});

volume.addEventListener("input", () => {
  audio.volume = volume.value;
  savePrefs();
});

audio.addEventListener("ended", () => {
  if (repeatMode === "one") {
    audio.currentTime = 0;
    playTrack();
    return;
  }

  const pos = orderPosition(current);
  const isLast = pos === playOrder.length - 1;

  if (isLast && repeatMode === "off") {
    pauseTrack();
    progress.value = 0;
    timeCurrent.textContent = "0:00";
    return;
  }

  if (autoplay.checked || repeatMode === "all") {
    nextTrack();
  } else {
    pauseTrack();
    progress.value = 0;
    timeCurrent.textContent = "0:00";
  }
});

searchInput.addEventListener("input", buildPlaylist);

/* Settings dropdown */
settingsBtn.addEventListener("click", () => {
  const isOpen = !settingsMenu.hidden;
  settingsMenu.hidden = isOpen;
  settingsBtn.setAttribute("aria-expanded", String(!isOpen));
});
document.addEventListener("click", (e) => {
  if (!settingsMenu.hidden && !settingsMenu.contains(e.target) && e.target !== settingsBtn && !settingsBtn.contains(e.target)) {
    settingsMenu.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  }
});

/* Keyboard shortcuts */
document.addEventListener("keydown", (e) => {
  if (e.target === searchInput) return;
  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "arrowright":
      audio.currentTime = Math.min((audio.currentTime || 0) + 5, audio.duration || 0);
      break;
    case "arrowleft":
      audio.currentTime = Math.max((audio.currentTime || 0) - 5, 0);
      break;
    case "arrowup":
      e.preventDefault();
      volume.value = Math.min(1, parseFloat(volume.value) + 0.05);
      audio.volume = volume.value;
      savePrefs();
      break;
    case "arrowdown":
      e.preventDefault();
      volume.value = Math.max(0, parseFloat(volume.value) - 0.05);
      audio.volume = volume.value;
      savePrefs();
      break;
    case "n":
      nextTrack();
      break;
    case "p":
      prevTrack();
      break;
    case "s":
      shuffleBtn.click();
      break;
    case "r":
      repeatBtn.click();
      break;
  }
});

/* =========================================================
   Boot sequence
   ========================================================= */
loadPrefs();
audio.volume = volume.value;

shuffleBtn.classList.toggle("on", shuffleOn);
shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
repeatBtn.classList.toggle("on", repeatMode !== "off");
repeatOneDot.hidden = repeatMode !== "one";
repeatBtn.setAttribute("aria-label", `Repeat ${repeatMode}`);

rebuildOrder();
buildPlaylist();
loadTrack(current);