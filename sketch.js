const GAME = {
  width: 1280,
  height: 720,
  durationSec: 60,
  targetOrders: 8,
};

const STATES = {
  IDLE: "IDLE",
  PRACTICE_SELECT: "PRACTICE_SELECT",
  TRANSITION: "TRANSITION",
  NEW_ORDER: "NEW_ORDER",
  ARM_SELECTION: "ARM_SELECTION",
  ARM_CONTROL: "ARM_CONTROL",
  STEP_CHALLENGE: "STEP_CHALLENGE",
  STEP_SUCCESS: "STEP_SUCCESS",
  TANGLED: "TANGLED",
  UNTANGLE: "UNTANGLE",
  SERVE_DRINK: "SERVE_DRINK",
  ORDER_COMPLETE: "ORDER_COMPLETE",
  GAME_OVER: "GAME_OVER",
};
const TRANSITION_DURATION_MS = 2800;
const RUSH_EVENT_DURATION_MS = 12000;
const COMBO_MILESTONES = [3, 5, 8];

const RECIPES = {
  Americano: ["coffee", "coffee"],
  Latte: ["coffee", "milk", "foam"],
  "Iced Latte": ["coffee", "syrup", "milk", "ice"],
  Mocha: ["coffee", "syrup", "milk", "foam"],
  "Iced Mocha": ["coffee", "syrup", "milk", "ice", "foam"],
};

const STATION_NAMES = ["coffee", "milk", "ice", "syrup", "foam", "serve"];

const ARM_KEYS = {
  W: "topRight",
  A: "topLeft",
  S: "bottomLeft",
  D: "bottomRight",
};
const OCTOPUS_Y_FACTOR = 0.38;
const PROFILE_STORAGE_KEY = "octopus_barista_profile_v1";
const POWERUPS = {
  calm: { key: "1", name: "Calm Brew", cost: 120 },
  focus: { key: "2", name: "Focus Shot", cost: 100 },
  turbo: { key: "3", name: "Turbo Hand", cost: 90 },
};

let game;
let audioEngine = null;
let musicTimer = null;
let musicStep = 0;
let audioUnlocked = false;
let startOverlayEl = null;
let openingVideoEl = null;
let startButtonEl = null;
let backgroundImg = null;
let profile = null;

const BG_REFERENCE = {
  width: 1472,
  height: 736,
  anchors: {
    coffee: { x: 0.145, y: 0.79, r: 46, label: "Coffee" },
    milk: { x: 0.343, y: 0.79, r: 46, label: "Milk" },
    ice: { x: 0.523, y: 0.765, r: 48, label: "Ice" },
    syrup: { x: 0.893, y: 0.44, r: 44, label: "Syrup" },
    foam: { x: 0.813, y: 0.79, r: 46, label: "Foam" },
    serve: { x: 0.67, y: 0.78, r: 52, label: "Serve" },
    barista: { x: 0.67, y: 0.79 },
  },
};

const DEFAULT_PROFILE = {
  bestScore: 0,
  bestOrders: 0,
  unlocks: {
    hats: ["chef"],
    cupSkins: ["classic"],
    stationThemes: ["caramel"],
    soundPacks: ["classic"],
  },
  selected: {
    hat: "chef",
    cupSkin: "classic",
    stationTheme: "caramel",
    soundPack: "classic",
  },
};

// --- Helper Functions for Aesthetics ---
function setShadow(blur, clr) {
  drawingContext.shadowBlur = blur;
  drawingContext.shadowColor = clr;
}
function clearShadow() {
  drawingContext.shadowBlur = 0;
}

function loadProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
      return;
    }
    const parsed = JSON.parse(raw);
    profile = {
      ...JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
      ...parsed,
      unlocks: {
        ...DEFAULT_PROFILE.unlocks,
        ...(parsed.unlocks || {}),
      },
      selected: {
        ...DEFAULT_PROFILE.selected,
        ...(parsed.selected || {}),
      },
    };
    applyProgressionUnlocks();
  } catch {
    profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
  }
}

function saveProfile() {
  if (!profile) return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

function applyProgressionUnlocks() {
  if (!profile) return;
  const unlocks = profile.unlocks;
  const pushUnique = (arr, v) => {
    if (!arr.includes(v)) arr.push(v);
  };

  if (profile.bestScore >= 400) pushUnique(unlocks.hats, "barista");
  if (profile.bestScore >= 800) pushUnique(unlocks.hats, "royal");
  if (profile.bestOrders >= 5) pushUnique(unlocks.cupSkins, "ceramic");
  if (profile.bestOrders >= 10) pushUnique(unlocks.cupSkins, "gold");
  if (profile.bestScore >= 500) pushUnique(unlocks.stationThemes, "latte");
  if (profile.bestScore >= 900) pushUnique(unlocks.stationThemes, "sunset");
  if (profile.bestOrders >= 6) pushUnique(unlocks.soundPacks, "soft");
  if (profile.bestScore >= 700) pushUnique(unlocks.soundPacks, "retro");

  // Keep current selections when valid; otherwise snap to newest unlocked.
  if (!unlocks.hats.includes(profile.selected.hat)) {
    profile.selected.hat = unlocks.hats[unlocks.hats.length - 1];
  }
  if (!unlocks.cupSkins.includes(profile.selected.cupSkin)) {
    profile.selected.cupSkin = unlocks.cupSkins[unlocks.cupSkins.length - 1];
  }
  if (!unlocks.stationThemes.includes(profile.selected.stationTheme)) {
    profile.selected.stationTheme =
      unlocks.stationThemes[unlocks.stationThemes.length - 1];
  }
  if (!unlocks.soundPacks.includes(profile.selected.soundPack)) {
    profile.selected.soundPack = unlocks.soundPacks[unlocks.soundPacks.length - 1];
  }
}

function preload() {
  backgroundImg = loadImage("Assets/background.png");
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("app");
  textFont("Avenir Next");
  loadProfile();
  bindStartOverlay();
  resetGame();
}

function bindStartOverlay() {
  startOverlayEl = document.getElementById("start-overlay");
  openingVideoEl = document.getElementById("opening-video");
  startButtonEl = document.getElementById("start-button");

  if (startOverlayEl) {
    startOverlayEl.addEventListener("pointerdown", () => {
      ensureAudioUnlocked();
      startAudioEngine();
    });
  }

  if (startButtonEl) {
    startButtonEl.addEventListener("click", () => {
      startShift();
    });
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function resetGame() {
  stopAudioEngine();
  game = {
    state: STATES.IDLE,
    stateStartMs: millis(),
    roundStartMs: null,
    currentOrder: null,
    stepIndex: 0,
    selectedArm: null,
    lockedArm: null,
    selectedChanges: [],
    // move initial arm tip up slightly to match the octopus vertical shift
    armTip: createVector(width * 0.5, height * 0.36),
    hoverStation: null,
    hoverSince: 0,
    challenge: null,
    tangleMeter: 0,
    stress: 15,
    score: 0,
    mistakes: 0,
    tangles: 0,
    ordersDone: 0,
    wrongStationHits: 0,
    armSwitches: 0,
    combo: 0,
    bestCombo: 0,
    noInputSince: millis(),
    untangleProgress: 0,
    lastStation: null,
    lastStationMs: 0,
    particles: [],
    bubbles: [],
    lastDrink: null,
    seenGuides: {},
    guidePopup: {
      open: false,
      step: null,
      openedMs: 0,
    },
    serveArmChosen: false,
    mode: "normal",
    practiceStep: "coffee",
    rushEvent: null,
    nextRushEventMs: millis() + random(14000, 22000),
    comboToast: null,
    nextChallengeFocus: false,
    turboUntilMs: 0,
    progressionUpdated: false,
    newUnlocks: [],
  };

  for (let i = 0; i < 20; i++) {
    game.bubbles.push({
      x: random(width),
      y: random(height),
      s: random(10, 40),
      speed: random(0.5, 2),
    });
  }
  showStartOverlay();
}

function cycleSelection(group, dir = 1) {
  if (!profile || !profile.unlocks || !profile.selected) return;
  const arr = profile.unlocks[group];
  if (!arr || !arr.length) return;
  const keyMap = {
    hats: "hat",
    cupSkins: "cupSkin",
    stationThemes: "stationTheme",
    soundPacks: "soundPack",
  };
  const selectedKey = keyMap[group];
  if (!selectedKey) return;
  const current = profile.selected[selectedKey];
  const idx = max(0, arr.indexOf(current));
  const next = (idx + dir + arr.length) % arr.length;
  profile.selected[selectedKey] = arr[next];
  saveProfile();
  game.comboToast = {
    text: `${groupLabel(group)} set: ${labelUnlockValue(arr[next])}`,
    untilMs: millis() + 1200,
  };
}

function groupLabel(group) {
  if (group === "hats") return "Hat";
  if (group === "cupSkins") return "Cup Skin";
  if (group === "stationThemes") return "Station Theme";
  if (group === "soundPacks") return "Sound Pack";
  return group;
}

function labelUnlockValue(v) {
  if (!v) return "";
  const s = `${v}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function startShift() {
  game.roundStartMs = null;
  game.state = STATES.TRANSITION;
  game.stateStartMs = millis();
  hideStartOverlay();
  ensureAudioUnlocked();
  startAudioEngine();
  playSfx("start");
}

function showStartOverlay() {
  if (startOverlayEl) startOverlayEl.classList.remove("hidden");
  if (openingVideoEl) {
    openingVideoEl.currentTime = 0;
    openingVideoEl.play().catch(() => {});
  }
}

function hideStartOverlay() {
  if (startOverlayEl) startOverlayEl.classList.add("hidden");
  if (openingVideoEl) {
    openingVideoEl.pause();
  }
}

function ensureAudioUnlocked() {
  if (audioUnlocked) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioEngine || !audioEngine.ctx) startAudioEngine();
  if (!audioEngine || !audioEngine.ctx) return;

  audioEngine.ctx
    .resume()
    .then(() => {
      audioUnlocked = true;
      playTone(520, 0.03, "sine", 0.001);
    })
    .catch(() => {});
}

// --- Audio Engine ---
function startAudioEngine() {
  if (audioEngine && audioEngine.ctx && audioEngine.ctx.state === "running")
    return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  const ctx = audioEngine?.ctx || new AC();
  const master = audioEngine?.master || ctx.createGain();
  const delay = ctx.createDelay();
  const feedback = ctx.createGain();

  if (!audioEngine) {
    master.gain.value = 0.25;
    delay.delayTime.value = 0.25;
    feedback.gain.value = 0.3;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(master);
    master.connect(ctx.destination);
  }

  audioEngine = { ctx, master, delay };
  if (ctx.state !== "running") ctx.resume();

  if (!musicTimer) {
    musicTimer = setInterval(playMusicStep, 400);
    musicStep = 0;
  }
}

function stopAudioEngine() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function playTone(freq, duration = 0.16, type = "sine", gain = 0.06, when = 0) {
  if (!audioEngine || !audioEngine.ctx) return;
  const ctx = audioEngine.ctx;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(g);
  g.connect(audioEngine.master);
  g.connect(audioEngine.delay);

  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playMusicStep() {
  if (!audioEngine || !audioEngine.ctx) return;
  if (game.state === STATES.IDLE) {
    const intro = [261.63, 311.13, 392.0, 311.13, 349.23, 440.0, 392.0, 311.13];
    const bass = [130.81, 130.81, 146.83, 146.83, 164.81, 164.81, 146.83, 130.81];
    const i = musicStep % intro.length;
    playTone(intro[i], 0.22, "sine", 0.028);
    if (i % 2 === 0) playTone(bass[i], 0.35, "triangle", 0.018, 0.02);
    musicStep += 1;
    return;
  }
  const prog = [261.63, 329.63, 392.0, 329.63, 293.66, 349.23, 440.0, 349.23];
  const bass = [130.81, 130.81, 146.83, 146.83, 164.81, 164.81, 146.83, 130.81];
  const i = musicStep % prog.length;
  const stressTone = map(game.stress, 0, 100, 0, 18);

  playTone(prog[i] + stressTone, 0.2, "sine", 0.04);
  if (i % 2 === 0) playTone(bass[i], 0.3, "triangle", 0.03, 0.01);
  musicStep += 1;
}

function playSfx(kind) {
  if (!audioEngine || !audioEngine.ctx) return;
  const mul = getSoundFreqMul();
  if (kind === "start") {
    playTone(392 * mul, 0.15, "triangle", 0.08);
    playTone(523.25 * mul, 0.25, "sine", 0.08, 0.1);
  } else if (kind === "select") {
    playTone(440 * mul, 0.08, "square", 0.02);
  } else if (kind === "success") {
    playTone(523.25 * mul, 0.1, "sine", 0.06);
    playTone(659.25 * mul, 0.15, "triangle", 0.05, 0.05);
  } else if (kind === "fail") {
    playTone(180 * mul, 0.15, "sawtooth", 0.04);
    playTone(130 * mul, 0.25, "sawtooth", 0.05, 0.05);
  } else if (kind === "untangle") {
    playTone((320 + random(-20, 40)) * mul, 0.05, "square", 0.02);
  } else if (kind === "serve") {
    playTone(523.25 * mul, 0.1, "triangle", 0.05);
    playTone(659.25 * mul, 0.1, "triangle", 0.05, 0.06);
    playTone(783.99 * mul, 0.2, "sine", 0.06, 0.12);
  }
}

function getSoundFreqMul() {
  const pack = profile?.selected?.soundPack || "classic";
  if (pack === "soft") return 0.93;
  if (pack === "retro") return 1.07;
  return 1;
}

function draw() {
  updateGlobalMeters();
  updateState();

  if (game.state === STATES.PRACTICE_SELECT) {
    drawPracticeSelect();
    return;
  }

  if (game.state === STATES.TRANSITION) {
    drawTransitionScene();
    return;
  }

  drawBackdrop();
  drawScene();
  drawStations();

  // Note: Arms are drawn first so they tuck neatly under the body
  drawArms();
  drawOctopus();

  drawHeader();
  drawOrderCard();
  drawGuidePanel();

  drawParticles();

  if (game.state === STATES.IDLE) drawStartOverlay();
  if (game.state === STATES.STEP_CHALLENGE) drawChallengeUi();
  if (game.guidePopup.open) drawChallengeGuidePopup();
  if (game.state === STATES.UNTANGLE || game.state === STATES.TANGLED)
    drawUntangleUi();
  drawRushEventBanner();
  drawPowerUpBar();
  drawComboToast();
  if (game.state === STATES.GAME_OVER) drawGameOver();
}

function startButtonRect() {
  return { x: width * 0.41, y: height * 0.65, w: width * 0.18, h: 56 };
}

function drawStartOverlay() {
  fill(13, 22, 44, 210);
  rect(0, 0, width, height);

  noStroke();
  for (let b of game.bubbles) {
    b.y -= b.speed;
    if (b.y < -50) b.y = height + 50;
    fill(120, 190, 255, 30);
    circle(b.x + sin(millis() * 0.001 + b.x) * 20, b.y, b.s);
  }

  setShadow(30, "rgba(0,0,0,0.5)");
  fill(255, 255, 255, 240);
  rect(width * 0.25, height * 0.15, width * 0.5, height * 0.7, 24);
  clearShadow();

  fill(230, 241, 255);
  rect(width * 0.25, height * 0.15, width * 0.5, 90, 24, 24, 0, 0);

  fill(33, 51, 92);
  textAlign(CENTER, TOP);
  textSize(48);
  textStyle(BOLD);
  text("Octopus Barista", width * 0.5, height * 0.175);
  textStyle(NORMAL);

  textSize(18);
  fill(80, 100, 140);
  text(
    "You know the recipe, but your body won't cooperate.",
    width * 0.5,
    height * 0.3,
  );

  textSize(16);
  textAlign(LEFT, TOP);
  fill(42, 65, 118);
  const startX = width * 0.32;
  const startY = height * 0.38;
  const spacing = 35;

  text("🐙  W A S D : Select tentacle", startX, startY);
  text("🎯  Mouse : Aim tentacle", startX, startY + spacing);
  text("⚡  SPACE : Challenge / Untangle", startX, startY + spacing * 2);
  text(
    "🧘  Hold R : Calm tangle meter   |   🔊 M : Mute",
    startX,
    startY + spacing * 3,
  );
  text(
    "⏱️  Goal: Finish 8 orders before shift ends",
    startX,
    startY + spacing * 4.5,
  );
  text(
    "🔥  Tip: Read each challenge guide once, then play fast for combo",
    startX,
    startY + spacing * 5.2,
  );
  text("🧪  Press P for Practice Mode", startX, startY + spacing * 5.9);
  text(
    "▶️  Choose mode: Start button / SPACE / ENTER = Game   |   P = Practice",
    startX,
    startY + spacing * 6.6,
  );

  const b = startButtonRect();
  const hover =
    mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h;
  const pulse = sin(millis() * 0.004) * 4;

  setShadow(
    hover ? 20 : 10,
    hover ? "rgba(83, 189, 123, 0.6)" : "rgba(87, 153, 222, 0.4)",
  );
  fill(hover ? color(83, 189, 123) : color(87, 153, 222));
  rect(b.x - pulse / 2, b.y - pulse / 2, b.w + pulse, b.h + pulse, 999);
  clearShadow();

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  textStyle(BOLD);
  text("Start Shift", b.x + b.w * 0.5, b.y + b.h * 0.5);
  textStyle(NORMAL);
}

function drawTransitionScene() {
  const elapsed = millis() - game.stateStartMs;
  const t = constrain(elapsed / TRANSITION_DURATION_MS, 0, 1);
  const p = backgroundPlacement();

  // Subtle moving camera over the cafe background.
  if (backgroundImg) {
    const zoom = lerp(1.08, 1.0, t);
    const w = p.w * zoom;
    const h = p.h * zoom;
    const x = (width - w) * 0.5 + sin(millis() * 0.0012) * 8;
    const y = (height - h) * 0.5 + cos(millis() * 0.0011) * 6;
    image(backgroundImg, x, y, w, h);
  } else {
    background(220, 232, 252);
  }

  fill(18, 28, 54, 58);
  rect(0, 0, width, height);

  // Morphing octopus as a compact loading companion near progress bar.
  const bw = min(460, width * 0.44);
  const bh = 16;
  const bx = width * 0.5 - bw * 0.5;
  const by = height * 0.86;
  const ox = lerp(bx - 48, bx + bw * t, easeOutCubic(t));
  const oy = by - 64 + sin(millis() * 0.004) * 4;
  drawMorphTransitionOctopus(ox, oy, t, 0.42);

  // Top text panel (separated from loading text to avoid overlap).
  const panelW = min(560, width * 0.56);
  const panelH = 132;
  const panelX = width * 0.5 - panelW * 0.5;
  const panelY = height * 0.08;
  setShadow(18, "rgba(0,0,0,0.28)");
  fill(255, 255, 255, 248);
  rect(panelX, panelY, panelW, panelH, 22);
  clearShadow();

  fill(42, 61, 102);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(36);
  text("Opening Cafe...", width * 0.5, panelY + 24);

  textStyle(NORMAL);
  textSize(16);
  fill(95, 112, 146);
  text("Get ready for the next rush", width * 0.5, panelY + 78);

  // Bottom loading section.
  fill(226, 234, 248, 240);
  rect(bx, by, bw, bh, 999);
  fill(128, 180, 246);
  rect(bx, by, bw * t, bh, 999);

  fill(246, 252, 255);
  textSize(13);
  text("Press SPACE / ENTER / Click to skip", width * 0.5, by + 26);
}

function easeOutCubic(x) {
  return 1 - pow(1 - x, 3);
}

function enterPracticeSelect() {
  hideStartOverlay();
  game.mode = "practice";
  game.state = STATES.PRACTICE_SELECT;
  game.stateStartMs = millis();
}

function startPracticeMode(step) {
  game.mode = "practice";
  game.practiceStep = step;
  game.roundStartMs = millis();
  game.combo = 0;
  game.score = 0;
  game.ordersDone = 0;
  game.state = STATES.NEW_ORDER;
  game.stateStartMs = millis();
}

function updateRushEvent() {
  if (game.mode === "practice") return;
  if (!game.roundStartMs) return;
  if (
    game.state === STATES.IDLE ||
    game.state === STATES.TRANSITION ||
    game.state === STATES.PRACTICE_SELECT ||
    game.state === STATES.GAME_OVER
  ) {
    return;
  }

  const now = millis();
  if (game.rushEvent && now > game.rushEvent.endMs) {
    game.rushEvent = null;
    game.nextRushEventMs = now + random(14000, 23000);
  }
  if (!game.rushEvent && now >= game.nextRushEventMs) {
    const kinds = [
      {
        name: "Power Surge",
        challengeSpeedMul: 1.2,
        scoreMul: 1.15,
        tangleGainMul: 1.15,
        holdNeedMul: 1.05,
      },
      {
        name: "Happy Hour",
        challengeSpeedMul: 1.0,
        scoreMul: 1.4,
        tangleGainMul: 0.95,
        holdNeedMul: 1.0,
      },
      {
        name: "Calm Brew",
        challengeSpeedMul: 0.92,
        scoreMul: 1.05,
        tangleGainMul: 0.75,
        holdNeedMul: 0.9,
      },
    ];
    const picked = random(kinds);
    game.rushEvent = {
      ...picked,
      startMs: now,
      endMs: now + RUSH_EVENT_DURATION_MS + random(-1200, 2200),
    };
  }
}

function handleGameOverProgression() {
  if (game.progressionUpdated || game.mode === "practice") return;
  game.progressionUpdated = true;
  if (!profile) return;
  const before = {
    hats: [...(profile.unlocks.hats || [])],
    cupSkins: [...(profile.unlocks.cupSkins || [])],
    stationThemes: [...(profile.unlocks.stationThemes || [])],
    soundPacks: [...(profile.unlocks.soundPacks || [])],
  };
  profile.bestScore = max(profile.bestScore || 0, floor(game.score));
  profile.bestOrders = max(profile.bestOrders || 0, game.ordersDone);
  applyProgressionUnlocks();
  const unlockedNow = [];
  for (const key of ["hats", "cupSkins", "stationThemes", "soundPacks"]) {
    for (const val of profile.unlocks[key] || []) {
      if (!before[key].includes(val)) {
        unlockedNow.push(`${groupLabel(key)}: ${labelUnlockValue(val)}`);
      }
    }
  }
  game.newUnlocks = unlockedNow;
  saveProfile();
}

function getRushModifiers() {
  if (!game.rushEvent) {
    return {
      challengeSpeedMul: 1,
      scoreMul: 1,
      tangleGainMul: 1,
      holdNeedMul: 1,
    };
  }
  return {
    challengeSpeedMul: game.rushEvent.challengeSpeedMul || 1,
    scoreMul: game.rushEvent.scoreMul || 1,
    tangleGainMul: game.rushEvent.tangleGainMul || 1,
    holdNeedMul: game.rushEvent.holdNeedMul || 1,
  };
}

function triggerComboMilestone() {
  if (!COMBO_MILESTONES.includes(game.combo)) return;
  const bonus = game.combo * 8;
  const calm = game.combo >= 8 ? 14 : game.combo >= 5 ? 10 : 6;
  game.score += bonus;
  game.tangleMeter = max(0, game.tangleMeter - calm);
  addParticles(width * 0.5, 122, color(244, 188, 121), 18);
  game.comboToast = {
    text: `Combo x${game.combo}! +${bonus} pts, -${calm}% tangle`,
    untilMs: millis() + 1800,
  };
}

function drawRushEventBanner() {
  if (!game.rushEvent || game.state === STATES.GAME_OVER) return;
  const leftMs = max(0, game.rushEvent.endMs - millis());
  const sec = (leftMs / 1000).toFixed(1);
  const w = 300;
  const h = 36;
  const x = width * 0.5 - w * 0.5;
  const y = 58;
  setShadow(8, "rgba(66,42,22,0.22)");
  fill(250, 235, 206, 235);
  rect(x, y, w, h, 999);
  clearShadow();
  fill(117, 79, 50);
  textAlign(CENTER, CENTER);
  textSize(13);
  textStyle(BOLD);
  text(`Rush Event: ${game.rushEvent.name} (${sec}s)`, width * 0.5, y + h * 0.53);
  textStyle(NORMAL);
}

function drawComboToast() {
  if (!game.comboToast) return;
  if (millis() > game.comboToast.untilMs) {
    game.comboToast = null;
    return;
  }
  const alpha = map(game.comboToast.untilMs - millis(), 0, 1800, 0, 235, true);
  fill(59, 38, 24, alpha * 0.56);
  rect(width * 0.5 - 220, height * 0.18, 440, 34, 999);
  fill(255, 240, 219, alpha);
  textAlign(CENTER, CENTER);
  textSize(14);
  textStyle(BOLD);
  text(game.comboToast.text, width * 0.5, height * 0.18 + 17);
  textStyle(NORMAL);
}

function activatePowerUp(kind) {
  const p = POWERUPS[kind];
  if (!p) return false;
  if (game.score < p.cost) {
    game.comboToast = {
      text: `Need ${p.cost} score for ${p.name}`,
      untilMs: millis() + 1200,
    };
    return false;
  }
  game.score -= p.cost;
  if (kind === "calm") {
    game.tangleMeter = max(0, game.tangleMeter - 28);
    game.stress = max(0, game.stress - 20);
    game.comboToast = { text: "Calm Brew used: -tangle, -stress", untilMs: millis() + 1700 };
  } else if (kind === "focus") {
    game.nextChallengeFocus = true;
    game.comboToast = { text: "Focus Shot ready: next challenge easier", untilMs: millis() + 1700 };
  } else if (kind === "turbo") {
    game.turboUntilMs = millis() + 9000;
    game.comboToast = { text: "Turbo Hand active: faster reach for 9s", untilMs: millis() + 1700 };
  }
  playSfx("success");
  return false;
}

function drawPowerUpBar() {
  if (
    game.state === STATES.IDLE ||
    game.state === STATES.TRANSITION ||
    game.state === STATES.PRACTICE_SELECT ||
    game.state === STATES.GAME_OVER
  ) {
    return;
  }
  const x = 18;
  const y = height - 64;
  const w = 560;
  const h = 42;
  setShadow(8, "rgba(66,42,22,0.18)");
  fill(252, 245, 232, 220);
  rect(x, y, w, h, 14);
  clearShadow();

  fill(102, 69, 43);
  textAlign(LEFT, CENTER);
  textSize(12);
  textStyle(BOLD);
  text(
    `Power-Ups  [1] Calm ${POWERUPS.calm.cost}  [2] Focus ${POWERUPS.focus.cost}  [3] Turbo ${POWERUPS.turbo.cost}`,
    x + 12,
    y + 14,
  );
  textStyle(NORMAL);
  fill(131, 95, 66);
  const turboLeft = max(0, game.turboUntilMs - millis());
  const turboTxt = turboLeft > 0 ? `Turbo ${nf(turboLeft / 1000, 1, 1)}s` : "Turbo off";
  const focusTxt = game.nextChallengeFocus ? "Focus ready" : "Focus off";
  text(`Score: ${floor(game.score)}  |  ${focusTxt}  |  ${turboTxt}`, x + 12, y + 30);
}

function drawPracticeSelect() {
  drawBackdrop();
  fill(42, 28, 18, 130);
  rect(0, 0, width, height);

  const w = min(620, width * 0.72);
  const h = 360;
  const x = width * 0.5 - w * 0.5;
  const y = height * 0.5 - h * 0.5;
  setShadow(18, "rgba(66,42,22,0.26)");
  fill(252, 245, 232, 246);
  rect(x, y, w, h, 24);
  clearShadow();

  fill(96, 64, 39);
  textAlign(CENTER, TOP);
  textStyle(BOLD);
  textSize(34);
  text("Practice Mode", width * 0.5, y + 26);
  textStyle(NORMAL);
  fill(133, 98, 68);
  textSize(16);
  text("Pick one challenge to drill (no round timer).", width * 0.5, y + 72);

  const items = [
    "1  Coffee Timing",
    "2  Milk Hold",
    "3  Ice Taps",
    "4  Syrup Precision",
    "5  Foam Sequence",
  ];
  for (let i = 0; i < items.length; i++) {
    const iy = y + 116 + i * 42;
    fill(244, 232, 214, 230);
    rect(x + 60, iy, w - 120, 32, 12);
    fill(107, 77, 53);
    textAlign(LEFT, CENTER);
    textSize(16);
    textStyle(BOLD);
    text(items[i], x + 78, iy + 16);
  }
  textStyle(NORMAL);
  fill(133, 98, 68);
  textAlign(CENTER, CENTER);
  textSize(13);
  text("Press number key to start, or ESC to go back", width * 0.5, y + h - 30);
}

function drawMorphTransitionOctopus(x, y, t, scaleMul = 1) {
  const morph = easeOutCubic(t);
  const headW = (lerp(100, 260, morph) + sin(millis() * 0.004) * 6) * scaleMul;
  const headH = (lerp(84, 240, morph) + sin(millis() * 0.0035) * 5) * scaleMul;
  const armScale = lerp(0.45, 1, morph) * scaleMul;

  // Four tentacles, same structure as in-game octopus.
  const bases = {
    topLeft: createVector(x - 75 * armScale, y + 60 * armScale),
    bottomLeft: createVector(x - 25 * armScale, y + 70 * armScale),
    bottomRight: createVector(x + 25 * armScale, y + 70 * armScale),
    topRight: createVector(x + 75 * armScale, y + 60 * armScale),
  };
  const tips = {
    topLeft: createVector(x - 90 * armScale, y + 90 * armScale),
    bottomLeft: createVector(x - 30 * armScale, y + 100 * armScale),
    bottomRight: createVector(x + 30 * armScale, y + 100 * armScale),
    topRight: createVector(x + 90 * armScale, y + 90 * armScale),
  };

  const armColor = color(158, 148, 255);
  const outlineCol = color(75, 77, 135);
  for (const arm of ["topLeft", "topRight", "bottomLeft", "bottomRight"]) {
    const base = bases[arm];
    const tip = tips[arm];
    const kx = (base.x + tip.x) * 0.5;
    const ky =
      (base.y + tip.y) * 0.5 +
      sin(millis() * 0.005 + base.x * 0.01) * (6 + 8 * morph);

    stroke(outlineCol);
    strokeWeight(60 * armScale);
    noFill();
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);

    stroke(armColor);
    strokeWeight(52 * armScale);
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);

    // Same suction cup look as in-game arms.
    noStroke();
    fill(220, 225, 255, 180);
    circle(base.x - 10 * armScale, base.y + 10 * armScale, 14 * armScale);
    circle(base.x + 10 * armScale, base.y + 5 * armScale, 12 * armScale);
  }

  setShadow(14, "rgba(0,0,0,0.25)");
  const grad = drawingContext.createLinearGradient(0, y - 140, 0, y + 120);
  grad.addColorStop(0, "#B399FF");
  grad.addColorStop(0.5, "#7DD1FF");
  grad.addColorStop(1, "#9E94FF");
  drawingContext.fillStyle = grad;
  drawingContext.strokeStyle = "#4B4D87";
  drawingContext.lineWidth = 4;
  ellipse(x, y, headW, headH);
  clearShadow();

  push();
  translate(x, y - (1 - morph) * 20 * scaleMul);
  scale(scaleMul);
  drawChefHat(0, 0);
  pop();

  // Fade-in face so the morph feels smooth.
  if (morph > 0.35) drawFaceScaled(x, y, "normal", scaleMul);
}

function updateGlobalMeters() {
  if (game.state === STATES.GAME_OVER) return;
  const dt = deltaTime / 1000;
  updateRushEvent();
  if (
    game.tangleMeter < 50 &&
    millis() - game.noInputSince > 1000 &&
    game.state !== STATES.STEP_CHALLENGE
  ) {
    game.tangleMeter = max(0, game.tangleMeter - 20 * dt);
  }
  if (keyIsDown(82)) {
    game.tangleMeter = max(0, game.tangleMeter - 34 * dt);
  }
  game.stress = constrain(game.stress - 3.5 * dt, 0, 100);
  const elapsed = game.roundStartMs ? (millis() - game.roundStartMs) / 1000 : 0;
  if (
    game.mode !== "practice" &&
    game.roundStartMs &&
    (elapsed >= GAME.durationSec || game.ordersDone >= GAME.targetOrders)
  ) {
    game.state = STATES.GAME_OVER;
    handleGameOverProgression();
  }
  if (game.tangleMeter >= 80 && !game.lockedArm) {
    const arms = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
    game.lockedArm = random(arms);
    if (game.selectedArm === game.lockedArm) game.selectedArm = null;
  }
  if (
    game.tangleMeter < 60 &&
    game.state !== STATES.TANGLED &&
    game.state !== STATES.UNTANGLE
  ) {
    game.lockedArm = null;
  }

  // At max tangle, use the normal tangle/untangle flow.
  if (
    game.tangleMeter >= 100 &&
    game.state !== STATES.TANGLED &&
    game.state !== STATES.UNTANGLE &&
    game.state !== STATES.GAME_OVER
  ) {
    failStep();
  }
}

function updateState() {
  switch (game.state) {
    case STATES.IDLE:
      break;
    case STATES.PRACTICE_SELECT:
      break;
    case STATES.TRANSITION:
      if (millis() - game.stateStartMs >= TRANSITION_DURATION_MS) {
        game.roundStartMs = millis();
        game.state = STATES.NEW_ORDER;
        game.stateStartMs = millis();
      }
      break;
    case STATES.NEW_ORDER:
      createOrder();
      game.state = STATES.ARM_SELECTION;
      game.stateStartMs = millis();
      break;
    case STATES.ARM_SELECTION:
      if (game.selectedArm) {
        game.state = STATES.ARM_CONTROL;
        game.stateStartMs = millis();
      }
      break;
    case STATES.ARM_CONTROL:
      updateArmReach();
      break;
    case STATES.STEP_CHALLENGE:
      updateChallenge();
      break;
    case STATES.STEP_SUCCESS:
      if (millis() - game.stateStartMs > 350) {
        if (game.mode === "practice") {
          game.stepIndex = 0;
          game.selectedArm = null;
          game.challenge = null;
          game.currentOrder.createdMs = millis();
          game.state = STATES.ARM_SELECTION;
        } else if (game.stepIndex >= game.currentOrder.steps.length) {
          game.selectedArm = null;
          game.serveArmChosen = false;
          game.state = STATES.SERVE_DRINK;
        } else {
          game.state = STATES.ARM_SELECTION;
        }
        game.stateStartMs = millis();
      }
      break;
    case STATES.TANGLED:
      if (millis() - game.stateStartMs > 250) {
        game.state = STATES.UNTANGLE;
        game.stateStartMs = millis();
      }
      break;
    case STATES.UNTANGLE:
      updateUntangleState();
      break;
    case STATES.SERVE_DRINK:
      if (game.selectedArm) updateArmReach();
      break;
    case STATES.ORDER_COMPLETE:
      if (millis() - game.stateStartMs > 900) {
        game.state = STATES.NEW_ORDER;
        game.stateStartMs = millis();
      }
      break;
  }
}

function createOrder() {
  if (game.mode === "practice") {
    const step = game.practiceStep || "coffee";
    game.currentOrder = {
      drink: `Practice: ${labelStep(step)}`,
      steps: [step],
      createdMs: millis(),
      startTangles: game.tangles,
      startWrongHits: game.wrongStationHits,
      startArmSwitches: game.armSwitches,
    };
    game.stepIndex = 0;
    game.selectedArm = null;
    game.serveArmChosen = false;
    game.challenge = null;
    game.hoverStation = null;
    return;
  }

  const elapsed = game.roundStartMs ? (millis() - game.roundStartMs) / 1000 : 0;
  let pool;
  if (elapsed < 25) pool = ["Americano", "Latte"];
  else if (elapsed < 70) pool = ["Americano", "Latte", "Iced Latte"];
  else pool = ["Americano", "Latte", "Iced Latte", "Mocha", "Iced Mocha"];
  const shuffledPool = shuffle([...pool], true);
  let drink = shuffledPool[0];
  if (game.lastDrink && shuffledPool.length > 1 && drink === game.lastDrink) {
    drink = shuffledPool.find((d) => d !== game.lastDrink) || drink;
  }
  game.lastDrink = drink;
  game.currentOrder = {
    drink,
    steps: [...RECIPES[drink]],
    createdMs: millis(),
    startTangles: game.tangles,
    startWrongHits: game.wrongStationHits,
    startArmSwitches: game.armSwitches,
  };
  game.stepIndex = 0;
  game.selectedArm = null;
  game.serveArmChosen = false;
  game.challenge = null;
  game.hoverStation = null;
}

function currentStep() {
  return !game.currentOrder
    ? null
    : game.currentOrder.steps[game.stepIndex] || null;
}
function requiredStation() {
  return game.state === STATES.SERVE_DRINK ? "serve" : currentStep();
}

function updateArmReach() {
  const turboActive = millis() < game.turboUntilMs;
  const base = armBase(game.selectedArm);
  const desired = createVector(mouseX, mouseY).sub(base);
  const reachLimit = game.state === STATES.SERVE_DRINK
    ? width * (turboActive ? 0.75 : 0.66)
    : width * (turboActive ? 0.5 : 0.45);
  desired.limit(reachLimit);
  const target = p5.Vector.add(base, desired);
  game.armTip.lerp(target, 0.25);
  const required = requiredStation();
  if (!required) return;
  let touched = null;
  for (const name of STATION_NAMES) {
    const s = station(name);
    if (dist(game.armTip.x, game.armTip.y, s.x, s.y) <= s.r + 8) {
      touched = name;
      break;
    }
  }
  if (!touched) {
    game.hoverStation = null;
    return;
  }
  if (touched !== game.hoverStation) {
    game.hoverStation = touched;
    game.hoverSince = millis();
    return;
  }
  const hoverNeedMs = turboActive ? 95 : 180;
  if (millis() - game.hoverSince < hoverNeedMs) return;
  if (touched === required) {
    if (game.state === STATES.SERVE_DRINK) completeServeDrink();
    else beginChallenge(touched);
  } else {
    game.mistakes += 1;
    game.wrongStationHits += 1;
    game.combo = 0;
    game.score = max(0, game.score - 5);
    addTangle(touched, 8);
    addParticles(
      station(touched).x,
      station(touched).y,
      color(246, 149, 128),
      8,
    );
    game.hoverStation = null;
  }
}

function addTangle(stationName, base) {
  const mods = getRushModifiers();
  let gain = base;
  const now = millis();
  if (stationName === game.lastStation) gain += 6;
  if (
    game.lastStation &&
    stationName !== game.lastStation &&
    now - game.lastStationMs < 2000
  )
    gain += 10;
  if (game.stress > 70) gain *= 1.2;
  gain *= mods.tangleGainMul;
  game.tangleMeter = constrain(game.tangleMeter + gain, 0, 100);
  game.stress = constrain(game.stress + 7, 0, 100);
  game.lastStation = stationName;
  game.lastStationMs = now;
}

function beginChallenge(step) {
  const lag = actionLag();
  const mods = getRushModifiers();
  if (step === "coffee") {
    game.challenge = {
      type: "timing",
      cursor: 0,
      dir: 1,
      zoneStart: random(0.25, 0.55),
      zoneWidth: 0.32,
      speed: (0.95 - lag * 0.22) * mods.challengeSpeedMul,
      timeoutMs: millis() + 2600 / mods.challengeSpeedMul,
    };
  } else if (step === "milk") {
    game.challenge = {
      type: "hold",
      marker: 0.5,
      markerFreq: 0.0058 * mods.challengeSpeedMul,
      hold: 0,
      needHold: (0.65 + lag * 0.12) * mods.holdNeedMul,
      timer: 0,
      maxTime: 3.2 / mods.challengeSpeedMul,
    };
  } else if (step === "ice") {
    game.challenge = {
      type: "tap",
      taps: 0,
      need: 3,
      timeoutMs: millis() + 2800 / mods.challengeSpeedMul,
    };
  } else if (step === "syrup") {
    game.challenge = {
      type: "timing",
      cursor: 0,
      dir: 1,
      zoneStart: random(0.3, 0.58),
      zoneWidth: 0.22,
      speed: (1.05 - lag * 0.2) * mods.challengeSpeedMul,
      timeoutMs: millis() + 2100 / mods.challengeSpeedMul,
    };
  } else if (step === "foam") {
    game.challenge = {
      type: "sequence",
      keys: random([
        ["SPACE", "E", "SPACE"],
        ["E", "SPACE", "E"],
        ["SPACE", "SPACE", "E"],
      ]),
      index: 0,
      mistakes: 0,
      maxMistakes: 2,
      timeoutMs: millis() + 5200 / mods.challengeSpeedMul,
    };
  } else {
    game.challenge = {
      type: "tap",
      taps: 0,
      need: 2,
      timeoutMs: millis() + 2200 / mods.challengeSpeedMul,
    };
  }

  if (game.nextChallengeFocus && game.challenge) {
    if (game.challenge.type === "timing") {
      game.challenge.zoneWidth = min(0.55, game.challenge.zoneWidth + 0.12);
    } else if (game.challenge.type === "hold") {
      game.challenge.needHold *= 0.78;
      game.challenge.maxTime += 0.6;
    } else if (game.challenge.type === "tap") {
      game.challenge.need = max(1, game.challenge.need - 1);
    } else if (game.challenge.type === "sequence") {
      game.challenge.maxMistakes += 1;
      game.challenge.timeoutMs += 1200;
    }
    game.nextChallengeFocus = false;
    game.comboToast = {
      text: "Focus Shot active: easier challenge!",
      untilMs: millis() + 1400,
    };
  }

  addTangle(step, 5);
  openChallengeGuide(step);
  game.state = STATES.STEP_CHALLENGE;
  game.stateStartMs = millis();
  game.hoverStation = null;
}

function updateChallenge() {
  const c = game.challenge;
  if (!c) return;
  if (game.guidePopup.open) return;
  const dt = deltaTime / 1000;
  if (c.type === "timing") {
    c.cursor += c.dir * c.speed * dt;
    if (c.cursor >= 1) {
      c.cursor = 1;
      c.dir = -1;
    }
    if (c.cursor <= 0) {
      c.cursor = 0;
      c.dir = 1;
    }
    if (millis() > c.timeoutMs) failStep();
  }
  if (c.type === "hold") {
    c.timer += dt;
    const freq = c.markerFreq || 0.0032;
    c.marker = 0.5 + sin(millis() * (freq + game.stress * 0.00002)) * 0.32;
    const safe = c.marker > 0.28 && c.marker < 0.72;
    const holding = mouseIsPressed || keyIsDown(32);
    if (holding && safe) c.hold += dt * 1.1;
    else if (holding && !safe) c.hold = max(0, c.hold - 0.22 * dt);
    else c.hold = max(0, c.hold - 0.12 * dt);
    if (c.hold >= c.needHold) successStep();
    if (c.timer > c.maxTime) failStep();
  }
  if (c.type === "tap") {
    if (c.taps >= c.need) successStep();
    if (millis() > c.timeoutMs) failStep();
  }
  if (c.type === "sequence") {
    if (c.index >= c.keys.length) successStep();
    if (millis() > c.timeoutMs || c.mistakes > c.maxMistakes) failStep();
  }
}

function successStep() {
  const mods = getRushModifiers();
  const waitSec = (millis() - game.currentOrder.createdMs) / 1000;
  const base = 45;
  const speedBonus = max(0, 24 - waitSec * 0.9);
  const precisionPenalty = game.mistakes * 1.1;
  game.combo += 1;
  game.bestCombo = max(game.bestCombo, game.combo);
  const comboBonus = min(30, (game.combo - 1) * 4);
  game.score += floor((base + speedBonus - precisionPenalty + comboBonus) * mods.scoreMul);
  triggerComboMilestone();
  playSfx("success");
  game.stepIndex += 1;
  game.selectedArm = null;
  game.challenge = null;
  game.state = STATES.STEP_SUCCESS;
  game.stateStartMs = millis();
}

function completeServeDrink() {
  if (!game.selectedArm || !game.serveArmChosen) return;
  const mods = getRushModifiers();
  const timeTaken = (millis() - game.currentOrder.createdMs) / 1000;
  const tangleDelta = game.tangles - game.currentOrder.startTangles;
  const wrongDelta = game.wrongStationHits - game.currentOrder.startWrongHits;
  const armDelta = game.armSwitches - game.currentOrder.startArmSwitches;
  const efficiencyPenalty = max(
    0,
    armDelta - (game.currentOrder.steps.length + 1),
  );
  const serveScore = floor(
    100 -
      timeTaken * 1.8 -
      tangleDelta * 10 -
      wrongDelta * 2 -
      efficiencyPenalty,
  );
  const rushBonus = timeTaken < 17 ? 20 : 0;
  game.score += floor((max(25, serveScore) + rushBonus) * mods.scoreMul);
  game.ordersDone += 1;
  game.serveArmChosen = false;
  game.combo += 1;
  game.bestCombo = max(game.bestCombo, game.combo);
  triggerComboMilestone();
  addParticles(
    station("serve").x,
    station("serve").y,
    color(115, 210, 145),
    18,
  );
  playSfx("serve");
  game.state = STATES.ORDER_COMPLETE;
  game.stateStartMs = millis();
}

function failStep() {
  game.tangles += 1;
  game.mistakes += 1;
  game.score = max(0, game.score - 18);
  game.challenge = null;
  game.combo = 0;
  playSfx("fail");
  game.untangleProgress = 0;
  game.state = STATES.TANGLED;
  game.stateStartMs = millis();
  game.tangleMeter = constrain(game.tangleMeter + 20, 0, 100);
  game.stress = constrain(game.stress + 14, 0, 100);
}

function updateUntangleState() {
  const dt = deltaTime / 1000;
  game.untangleProgress = max(0, game.untangleProgress - 10 * dt);
  if (game.untangleProgress >= 100) {
    game.tangleMeter = max(0, game.tangleMeter - 48);
    game.lockedArm = null;
    game.selectedArm = null;
    game.state = STATES.ARM_SELECTION;
    game.stateStartMs = millis();
    playSfx("success");
  }
}

function actionLag() {
  if (game.tangleMeter >= 80) return 0.6;
  if (game.tangleMeter >= 50) return 0.3;
  return 0.1;
}

// ... EVENT HANDLERS ...
function keyPressed() {
  game.noInputSince = millis();
  ensureAudioUnlocked();
  if (game.state === STATES.PRACTICE_SELECT) {
    if (keyCode === ESCAPE) {
      resetGame();
      return false;
    }
    const map = {
      1: "coffee",
      2: "milk",
      3: "ice",
      4: "syrup",
      5: "foam",
    };
    if (map[key]) {
      startPracticeMode(map[key]);
      return false;
    }
    return false;
  }
  if (game.state === STATES.TRANSITION && (key === " " || keyCode === ENTER)) {
    game.roundStartMs = millis();
    game.state = STATES.NEW_ORDER;
    game.stateStartMs = millis();
    return false;
  }
  if (game.guidePopup.open) {
    if (
      keyCode === ESCAPE ||
      keyCode === ENTER ||
      key === " " ||
      key.toUpperCase() === "C"
    ) {
      closeChallengeGuide();
    }
    return false;
  }
  if (key.toUpperCase() === "M" && audioEngine?.master) {
    const muted = audioEngine.master.gain.value < 0.01;
    audioEngine.master.gain.value = muted ? 0.25 : 0.0001;
    return false;
  }
  if (
    game.state !== STATES.IDLE &&
    game.state !== STATES.TRANSITION &&
    game.state !== STATES.PRACTICE_SELECT &&
    game.state !== STATES.GAME_OVER
  ) {
    if (key === POWERUPS.calm.key) return activatePowerUp("calm");
    if (key === POWERUPS.focus.key) return activatePowerUp("focus");
    if (key === POWERUPS.turbo.key) return activatePowerUp("turbo");
  }
  if (game.state === STATES.IDLE) {
    if (key.toUpperCase() === "H") {
      cycleSelection("hats", 1);
      return false;
    }
    if (key.toUpperCase() === "J") {
      cycleSelection("cupSkins", 1);
      return false;
    }
    if (key.toUpperCase() === "K") {
      cycleSelection("stationThemes", 1);
      return false;
    }
    if (key.toUpperCase() === "L") {
      cycleSelection("soundPacks", 1);
      return false;
    }
    if (key.toUpperCase() === "P") {
      enterPracticeSelect();
      return false;
    }
    if (key === " " || keyCode === ENTER) {
      startShift();
      return false;
    }
  }
  if (game.state === STATES.GAME_OVER) {
    if (key.toUpperCase() === "H") {
      cycleSelection("hats", 1);
      return false;
    }
    if (key.toUpperCase() === "J") {
      cycleSelection("cupSkins", 1);
      return false;
    }
    if (key.toUpperCase() === "K") {
      cycleSelection("stationThemes", 1);
      return false;
    }
    if (key.toUpperCase() === "L") {
      cycleSelection("soundPacks", 1);
      return false;
    }
    if (key === " ") {
      resetGame();
      return false;
    }
  }
  if (game.mode === "practice" && key.toUpperCase() === "Q") {
    resetGame();
    return false;
  }
  if (
    game.state === STATES.ARM_SELECTION ||
    game.state === STATES.ARM_CONTROL ||
    game.state === STATES.SERVE_DRINK
  ) {
    const k = key.toUpperCase();
    if (ARM_KEYS[k]) {
      const arm = ARM_KEYS[k];
      if (arm !== game.lockedArm) {
        game.selectedArm = arm;
        game.armTip = armBase(arm).copy();
        if (game.state === STATES.SERVE_DRINK) game.serveArmChosen = true;
        registerArmChange();
        playSfx("select");
      }
      return false;
    }
    if (k === "X") {
      game.selectedArm = null;
      game.serveArmChosen = false;
      game.state = STATES.ARM_SELECTION;
      game.score = max(0, game.score - 4);
      return false;
    }
  }
  if (game.state === STATES.STEP_CHALLENGE) {
    const c = game.challenge;
    if (!c) return false;
    if (c.type === "timing" && key === " ") {
      const inZone =
        c.cursor >= c.zoneStart && c.cursor <= c.zoneStart + c.zoneWidth;
      if (inZone) successStep();
      else failStep();
      return false;
    }
    if (c.type === "tap" && (key === " " || key.toUpperCase() === "E")) {
      c.taps += 1;
      return false;
    }
    if (c.type === "sequence") {
      const k = key === " " ? "SPACE" : key.toUpperCase();
      const expected = c.keys[c.index];
      if (k === expected) {
        c.index += 1;
        if (c.index >= c.keys.length) successStep();
      } else if (k === "SPACE" || k === "E") {
        c.mistakes += 1;
      }
      return false;
    }
  }
  if (
    (game.state === STATES.TANGLED || game.state === STATES.UNTANGLE) &&
    key === " "
  ) {
    game.untangleProgress += 14;
    playSfx("untangle");
    return false;
  }
  return false;
}

function mousePressed() {
  game.noInputSince = millis();
  ensureAudioUnlocked();
  if (game.state === STATES.TRANSITION) {
    game.roundStartMs = millis();
    game.state = STATES.NEW_ORDER;
    game.stateStartMs = millis();
    return false;
  }
  if (game.state === STATES.GAME_OVER) {
    const cycleButtons = gameOverCycleButtons();
    for (const b of cycleButtons) {
      if (
        mouseX > b.x &&
        mouseX < b.x + b.w &&
        mouseY > b.y &&
        mouseY < b.y + b.h
      ) {
        cycleSelection(b.key, 1);
        return false;
      }
    }
    const restart = gameOverRestartRect();
    if (
      mouseX > restart.x &&
      mouseX < restart.x + restart.w &&
      mouseY > restart.y &&
      mouseY < restart.y + restart.h
    ) {
      resetGame();
      return false;
    }
  }
  if (game.guidePopup.open) {
    const b = guideCloseButtonRect();
    if (mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h) {
      closeChallengeGuide();
    }
    return false;
  }
  if (game.state === STATES.IDLE) {
    const b = startButtonRect();
    if (
      mouseX > b.x &&
      mouseX < b.x + b.w &&
      mouseY > b.y &&
      mouseY < b.y + b.h
    )
      startShift();
  }
}

function registerArmChange() {
  game.armSwitches += 1;
  const now = millis();
  game.selectedChanges.push(now);
  game.selectedChanges = game.selectedChanges.filter((t) => now - t < 1000);
  if (game.selectedChanges.length >= 4) {
    game.selectedChanges = [];
    game.stress = constrain(game.stress + 8, 0, 100);
    game.tangleMeter = constrain(game.tangleMeter + 6, 0, 100);
    addParticles(width - 150, height - 155, color(130, 200, 255), 10);
  }
}

function station(name) {
  const anchor = BG_REFERENCE.anchors[name];
  if (!anchor) return null;
  const p = scenePoint(anchor.x, anchor.y);
  const scale = sceneScale();
  return {
    x: p.x,
    y: p.y,
    r: anchor.r * scale,
    label: anchor.label,
  };
}

function armBase(arm) {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5;
  // raise baseline further so tentacles clear the ingredient panels
  const y = height * OCTOPUS_Y_FACTOR + bob;
  const map = {
    topLeft: createVector(x - 75, y + 60),
    bottomLeft: createVector(x - 25, y + 70),
    bottomRight: createVector(x + 25, y + 70),
    topRight: createVector(x + 75, y + 60),
  };
  return map[arm] || createVector(x, y);
}

function drawBackdrop() {
  const p = backgroundPlacement();
  if (backgroundImg) {
    image(backgroundImg, p.x, p.y, p.w, p.h);
  } else {
    background(235, 241, 252);
  }
  noStroke();
  fill(255, 255, 255, 22);
  rect(0, 0, width, height);
  const theme = profile?.selected?.stationTheme || "caramel";
  if (theme === "latte") {
    fill(227, 188, 140, 22);
    rect(0, 0, width, height);
  } else if (theme === "sunset") {
    fill(234, 138, 88, 24);
    rect(0, 0, width, height);
  } else {
    fill(176, 132, 90, 12);
    rect(0, 0, width, height);
  }
  if (game.tangleMeter >= 50) {
    push();
    noFill();
    stroke(
      game.tangleMeter >= 80 ? color(125, 65, 84, 92) : color(233, 149, 85, 75),
    );
    strokeWeight(3);
    for (let i = 0; i < 11; i++) {
      beginShape();
      for (let x = -40; x <= width + 40; x += 28) {
        const yy =
          128 +
          i * 40 +
          sin(0.012 * x + i + millis() * 0.0018) *
            (10 + game.tangleMeter * 0.12);
        curveVertex(x, yy);
      }
      endShape();
    }
    pop();
  }
}

function drawScene() {
  // Background scene comes from Assets/background.png.
}

function drawLamp(x, y) {
  fill(255, 238, 189, 125);
  ellipse(x, y + 38, 150, 95);
  fill(255, 225, 158);
  circle(x, y, 16);
}

function getStationThemePalette() {
  const theme = profile?.selected?.stationTheme || "caramel";
  if (theme === "latte") {
    return {
      shadowReq: "rgba(184, 139, 97, 0.28)",
      shadowBase: "rgba(77, 57, 38, 0.16)",
      cardReq: color(251, 237, 214, 160),
      cardBase: color(245, 232, 214, 145),
      innerReq: color(255, 231, 194, 105),
      innerBase: color(255, 245, 229, 95),
      topStripe: color(255, 252, 246, 110),
      chipServe: color(119, 167, 104, 185),
      chip: color(190, 139, 97, 176),
      textMain: color(89, 60, 40, 230),
      textSub: color(133, 99, 73, 214),
      reqStroke: color(194, 143, 96, 184),
      reqStroke2: color(204, 156, 108, 150),
      badge: color(185, 130, 84, 202),
    };
  }
  if (theme === "sunset") {
    return {
      shadowReq: "rgba(199, 116, 79, 0.28)",
      shadowBase: "rgba(84, 43, 29, 0.16)",
      cardReq: color(252, 226, 206, 160),
      cardBase: color(246, 223, 206, 145),
      innerReq: color(255, 212, 179, 108),
      innerBase: color(255, 240, 226, 92),
      topStripe: color(255, 245, 236, 104),
      chipServe: color(149, 180, 98, 180),
      chip: color(207, 125, 82, 174),
      textMain: color(95, 52, 34, 230),
      textSub: color(142, 90, 66, 214),
      reqStroke: color(206, 125, 83, 182),
      reqStroke2: color(220, 145, 98, 150),
      badge: color(203, 116, 72, 200),
    };
  }
  return {
    shadowReq: "rgba(173, 124, 78, 0.3)",
    shadowBase: "rgba(54, 34, 21, 0.14)",
    cardReq: color(250, 234, 206, 155),
    cardBase: color(248, 238, 223, 132),
    innerReq: color(252, 225, 181, 95),
    innerBase: color(255, 248, 238, 86),
    topStripe: color(255, 250, 244, 96),
    chipServe: color(122, 168, 102, 178),
    chip: color(177, 127, 83, 172),
    textMain: color(82, 54, 36, 225),
    textSub: color(127, 92, 64, 210),
    reqStroke: color(186, 132, 85, 178),
    reqStroke2: color(196, 146, 96, 142),
    badge: color(177, 121, 73, 196),
  };
}

function drawStations() {
  const req = requiredStation();
  const th = getStationThemePalette();
  for (const name of STATION_NAMES) {
    const s = station(name);
    const required = name === req;
    const touched =
      name === game.hoverStation &&
      (game.state === STATES.ARM_CONTROL || game.state === STATES.SERVE_DRINK);
    const sz = sceneScale();
    const cardW = 126 * sz;
    const cardH = 118 * sz;
    const cardX = s.x - cardW * 0.5;
    const cardY = s.y - cardH * 0.5;

    setShadow(
      required ? 12 : 7,
      required ? th.shadowReq : th.shadowBase,
    );
    fill(required ? th.cardReq : th.cardBase);
    if (touched) fill(255, 226, 181, 170);
    rect(cardX, cardY, cardW, cardH, 18 * sz);
    clearShadow();

    // Inner glass layer
    fill(required ? th.innerReq : th.innerBase);
    rect(cardX + 6 * sz, cardY + 7 * sz, cardW - 12 * sz, cardH - 14 * sz, 14 * sz);

    // Top highlight stripe
    fill(th.topStripe);
    rect(cardX + 8 * sz, cardY + 9 * sz, cardW - 16 * sz, 14 * sz, 999);

    // Accent chip
    fill(name === "serve" ? th.chipServe : th.chip);
    circle(cardX + cardW - 18 * sz, cardY + 18 * sz, 16 * sz);

    // Main icon area
    fill(255, 255, 255, 62);
    circle(s.x, s.y - 4 * sz, 52 * sz);
    drawIngredientIcon(name, s.x, s.y - 4 * sz, 30 * sz);

    // Label
    textSize(12 * sz);
    textStyle(BOLD);
    textAlign(CENTER, CENTER);
    fill(th.textMain);
    noStroke();
    text(s.label, s.x, cardY + cardH - 26 * sz);

    // Small status text
    fill(th.textSub);
    textStyle(NORMAL);
    textSize(9 * sz);
    text(required ? "TARGET" : "READY", s.x, cardY + cardH - 13 * sz);
    noStroke();

    if (required) {
      noFill();
      stroke(th.reqStroke);
      strokeWeight(3 * sz);
      rect(cardX - 2 * sz, cardY - 2 * sz, cardW + 4 * sz, cardH + 4 * sz, 20 * sz);
      // Animated callout ring around icon.
      stroke(th.reqStroke2);
      circle(s.x, s.y - 4 * sz, 58 * sz + sin(millis() * 0.006) * 4 * sz);
      noStroke();
      fill(th.badge);
      rect(s.x - 30 * sz, cardY - 14 * sz, 60 * sz, 14 * sz, 999);
      fill(255);
      textAlign(CENTER, CENTER);
      textStyle(BOLD);
      textSize(9 * sz);
      text("DO NOW", s.x, cardY - 7 * sz);
      noStroke();
    }
  }
}

function drawArms() {
  const arms = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  const level =
    game.tangleMeter >= 80
      ? "full"
      : game.tangleMeter >= 50
        ? "half"
        : "normal";

  for (const arm of arms) {
    const base = armBase(arm);
    let tip = defaultArmTip(arm);
    if (arm === game.selectedArm && game.state === STATES.ARM_CONTROL)
      tip = game.armTip.copy();

    // Synced to the glossy blue/purple palette
    let armColor = color(158, 148, 255);
    let outlineCol = color(75, 77, 135);

    if (arm === game.lockedArm) armColor = color(152, 173, 255);

    setShadow(10, "rgba(0,0,0,0.2)");
    stroke(outlineCol);
    strokeWeight(60);
    noFill();
    const kx = (base.x + tip.x) * 0.5;
    const ky =
      (base.y + tip.y) * 0.5 +
      sin(millis() * 0.005 + base.x * 0.01) *
        (level === "full" ? 24 : level === "half" ? 16 : 8);
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);
    clearShadow();

    stroke(armColor);
    strokeWeight(52);
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);

    // Shiny purple-blue suction cups
    noStroke();
    fill(220, 225, 255, 180);
    circle(base.x - 10, base.y + 10, 14);
    circle(base.x + 10, base.y + 5, 12);
  }
}

// THE NEW GLOSSY BLUE/PURPLE OCTOPUS
function drawOctopus() {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5;
  // lowered slightly while staying clear of top HUD and station elements
  const y = height * OCTOPUS_Y_FACTOR + bob;
  const mode =
    game.state === STATES.TANGLED ||
    game.state === STATES.UNTANGLE ||
    game.tangleMeter >= 80
      ? "full"
      : game.tangleMeter >= 50
        ? "half"
        : "normal";

  setShadow(15, "rgba(0,0,0,0.3)");

  // Create HTML5 Canvas Linear Gradient for that smooth, glass-like look
  let grad = drawingContext.createLinearGradient(0, y - 140, 0, y + 120);
  grad.addColorStop(0, "#B399FF");
  grad.addColorStop(0.5, "#7DD1FF");
  grad.addColorStop(1, "#9E94FF");

  drawingContext.fillStyle = grad;
  drawingContext.strokeStyle = "#4B4D87";
  drawingContext.lineWidth = 4;

  // Main Head Shape
  ellipse(x, y, 260, 240);
  clearShadow();
  drawChefHat(x, y);

  // Glossy Highlights
  noStroke();
  fill(255, 255, 255, 220); // Bright white gloss

  push();
  translate(x - 50, y - 80);
  rotate(-PI / 8);
  ellipse(0, 0, 75, 35); // Main big reflection
  pop();

  fill(255, 255, 255, 150); // Softer dots
  circle(x + 70, y - 60, 12);
  circle(x + 90, y - 30, 8);
  circle(x + 85, y - 10, 5);

  drawFace(x, y, mode);
}

function drawChefHat(x, y) {
  const hat = profile?.selected?.hat || "chef";
  if (hat === "barista") {
    setShadow(6, "rgba(0,0,0,0.16)");
    fill(118, 78, 51);
    stroke(86, 56, 36);
    strokeWeight(2);
    arc(x, y - 118, 168, 78, PI, TWO_PI);
    noStroke();
    fill(156, 104, 66);
    rect(x - 70, y - 122, 140, 20, 8);
    clearShadow();
    return;
  }
  if (hat === "royal") {
    setShadow(7, "rgba(0,0,0,0.16)");
    fill(227, 184, 84);
    stroke(182, 140, 52);
    strokeWeight(2);
    rect(x - 72, y - 130, 144, 26, 8);
    for (let i = -2; i <= 2; i++) {
      triangle(
        x + i * 28 - 12,
        y - 130,
        x + i * 28,
        y - 156,
        x + i * 28 + 12,
        y - 130,
      );
    }
    fill(255, 232, 166);
    circle(x - 28, y - 116, 7);
    circle(x, y - 116, 7);
    circle(x + 28, y - 116, 7);
    clearShadow();
    noStroke();
    return;
  }

  setShadow(8, "rgba(0,0,0,0.16)");
  fill(248, 248, 248, 245);
  stroke(214, 214, 214);
  strokeWeight(2);

  // Puffy top
  circle(x - 45, y - 158, 58);
  circle(x - 12, y - 172, 64);
  circle(x + 22, y - 168, 62);
  circle(x + 50, y - 152, 54);

  // Hat body
  rect(x - 52, y - 176, 104, 52, 18);

  // Brim
  fill(238, 238, 238, 250);
  rect(x - 72, y - 128, 144, 24, 12);
  clearShadow();
  noStroke();
}

function drawFace(x, y, mode) {
  if (mode === "full") {
    drawSpiralEye(x - 55, y + 15);
    drawSpiralEye(x + 55, y + 15);
    fill(40, 45, 80);
    ellipse(x, y + 45, 26, 12);
    return;
  }

  // Large Dark Navy Eyes
  fill(35, 35, 60);
  noStroke();
  ellipse(x - 55, y + 15, 36, 44);
  ellipse(x + 55, y + 15, 36, 44);

  // Big Cute Anime Catchlights
  fill(255);
  ellipse(x - 62, y + 5, 14, 18);
  ellipse(x + 48, y + 5, 14, 18);
  circle(x - 48, y + 25, 8);
  circle(x + 62, y + 25, 8);

  // Soft Pink/Blue Blush
  fill(255, 160, 200, 100);
  ellipse(x - 85, y + 35, 30, 15);
  ellipse(x + 85, y + 35, 30, 15);

  // Cute Tiny Mouth
  noFill();
  stroke(35, 35, 60);
  strokeWeight(3);
  if (mode === "half") {
    line(x - 8, y + 30, x + 8, y + 30);
    // Sweat drop for warning state
    fill(160, 220, 255);
    noStroke();
    push();
    translate(x + 85, y - 15);
    rotate(-PI / 6);
    ellipse(0, 0, 12, 22);
    pop();
  } else {
    arc(x, y + 25, 16, 12, 0, PI);
  }
  noStroke();
}

function drawFaceScaled(x, y, mode, s = 1) {
  if (mode === "full") {
    drawSpiralEyeScaled(x - 55 * s, y + 15 * s, s);
    drawSpiralEyeScaled(x + 55 * s, y + 15 * s, s);
    fill(40, 45, 80);
    ellipse(x, y + 45 * s, 26 * s, 12 * s);
    return;
  }

  fill(35, 35, 60);
  noStroke();
  ellipse(x - 55 * s, y + 15 * s, 36 * s, 44 * s);
  ellipse(x + 55 * s, y + 15 * s, 36 * s, 44 * s);

  fill(255);
  ellipse(x - 62 * s, y + 5 * s, 14 * s, 18 * s);
  ellipse(x + 48 * s, y + 5 * s, 14 * s, 18 * s);
  circle(x - 48 * s, y + 25 * s, 8 * s);
  circle(x + 62 * s, y + 25 * s, 8 * s);

  fill(255, 160, 200, 100);
  ellipse(x - 85 * s, y + 35 * s, 30 * s, 15 * s);
  ellipse(x + 85 * s, y + 35 * s, 30 * s, 15 * s);

  noFill();
  stroke(35, 35, 60);
  strokeWeight(3 * s);
  if (mode === "half") {
    line(x - 8 * s, y + 30 * s, x + 8 * s, y + 30 * s);
    fill(160, 220, 255);
    noStroke();
    push();
    translate(x + 85 * s, y - 15 * s);
    rotate(-PI / 6);
    ellipse(0, 0, 12 * s, 22 * s);
    pop();
  } else {
    arc(x, y + 25 * s, 16 * s, 12 * s, 0, PI);
  }
  noStroke();
}

function drawSpiralEye(x, y) {
  noFill();
  stroke(58, 35, 93);
  strokeWeight(4);
  beginShape();
  for (let a = 0; a < TWO_PI * 2.1; a += 0.2) {
    const r = map(a, 0, TWO_PI * 2.1, 2, 14);
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape();
  noStroke();
}

function drawSpiralEyeScaled(x, y, s = 1) {
  noFill();
  stroke(58, 35, 93);
  strokeWeight(4 * s);
  beginShape();
  for (let a = 0; a < TWO_PI * 2.1; a += 0.2) {
    const r = map(a, 0, TWO_PI * 2.1, 2, 14) * s;
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape();
  noStroke();
}

function defaultArmTip(arm) {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5;
  const y = height * OCTOPUS_Y_FACTOR + bob;
  const t = millis() * 0.002;
  // Make them rest closely beneath the body with a slight wiggle
  if (arm === "topLeft")
    return createVector(x - 90 + sin(t) * 5, y + 90 + cos(t * 1.2) * 5);
  if (arm === "bottomLeft")
    return createVector(x - 30 + sin(t * 1.3) * 5, y + 100 + cos(t) * 5);
  if (arm === "bottomRight")
    return createVector(x + 30 + cos(t * 1.15) * 5, y + 100 + sin(t) * 5);
  if (arm === "topRight")
    return createVector(x + 90 + cos(t * 1.1) * 5, y + 90 + sin(t * 0.9) * 5);
  return createVector(x, y);
}

function backgroundPlacement() {
  if (!backgroundImg || !backgroundImg.width || !backgroundImg.height) {
    return { x: 0, y: 0, w: width, h: height };
  }
  const imgRatio = backgroundImg.width / backgroundImg.height;
  const canvasRatio = width / height;
  if (canvasRatio > imgRatio) {
    const drawW = width;
    const drawH = width / imgRatio;
    return { x: 0, y: (height - drawH) * 0.5, w: drawW, h: drawH };
  }
  const drawH = height;
  const drawW = height * imgRatio;
  return { x: (width - drawW) * 0.5, y: 0, w: drawW, h: drawH };
}

function scenePoint(nx, ny) {
  const p = backgroundPlacement();
  return createVector(p.x + p.w * nx, p.y + p.h * ny);
}

function sceneScale() {
  const p = backgroundPlacement();
  return p.w / BG_REFERENCE.width;
}

// ... UI PANELS ...
function drawHeader() {
  const elapsed = game.roundStartMs
    ? floor((millis() - game.roundStartMs) / 1000)
    : 0;
  const left = max(0, GAME.durationSec - elapsed);
  const x = width - 290;
  const y = 110;
  const w = 270;
  const h = 96;

  setShadow(12, "rgba(66,42,22,0.18)");
  fill(252, 245, 232, 230);
  rect(x, y, w, h, 18);
  clearShadow();

  fill(92, 62, 38);
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(16);
  text("Shift", x + 16, y + 24);

  fill(125, 90, 62);
  textAlign(RIGHT, CENTER);
  textSize(14);
  text(
    game.mode === "practice"
      ? "🧪 Practice"
      : `⏱ ${nf(floor(left / 60), 2)}:${nf(left % 60, 2)}`,
    x + w - 16,
    y + 24,
  );

  fill(118, 82, 54);
  textAlign(LEFT, TOP);
  textSize(13);
  textStyle(BOLD);
  text(`Orders ${game.ordersDone}/${GAME.targetOrders}`, x + 16, y + 44);
  fill(89, 59, 36);
  text(`Score ${floor(game.score)}`, x + 16, y + 62);
  fill(200, 124, 64);
  text(`Combo x${game.combo}`, x + 146, y + 44);
  fill(182, 95, 82);
  text(`Mistakes ${game.mistakes}`, x + 146, y + 62);

  fill(126, 95, 70);
  textSize(12);
  textStyle(NORMAL);
  text("Stress", x + 16, y + 80);
  drawMeter(
    x + 68,
    y + 82,
    182,
    10,
    game.stress,
    color(203, 154, 111),
    color(196, 93, 82),
  );

  drawTangleBar(width - 290, 20, 270, 76);
}

function drawMeter(x, y, w, h, v, c1, c2) {
  fill(236, 223, 206);
  rect(x, y, w, h, 999);
  fill(lerpColor(c1, c2, v / 100));
  rect(x, y, (w * v) / 100, h, 999);
}

function drawTangleBar(x, y, w, h) {
  setShadow(12, "rgba(66,42,22,0.18)");
  fill(252, 245, 232, 230);
  rect(x, y, w, h, 18);
  clearShadow();

  fill(92, 62, 38);
  textAlign(LEFT, CENTER);
  textSize(15);
  textStyle(BOLD);
  text("Tangle", x + 14, y + 20);

  textAlign(RIGHT, CENTER);
  textSize(13);
  textStyle(NORMAL);
  fill(125, 90, 62);
  text(`${floor(game.tangleMeter)}%`, x + w - 14, y + 20);

  const bx = x + 14;
  const by = y + 34;
  const bw = w - 28;
  const bh = 14;
  fill(236, 223, 206);
  rect(bx, by, bw, bh, 999);

  const t = game.tangleMeter / 100;
  const cA = color(189, 150, 118);
  const cB = color(220, 161, 92);
  const cC = color(196, 93, 82);
  fill(t < 0.5 ? lerpColor(cA, cB, t * 2) : lerpColor(cB, cC, (t - 0.5) * 2));
  rect(bx, by, bw * t, bh, 999);

  fill(126, 95, 70);
  textAlign(LEFT, CENTER);
  textSize(11);
  textStyle(NORMAL);
  text("80%+ locks one arm | hold R to calm", x + 14, y + 58);
}

function drawOrderCard() {
  const x = 20;
  const y = 20;
  const w = 270;
  const h = 252;

  setShadow(14, "rgba(66,42,22,0.18)");
  fill(252, 245, 232, 232);
  rect(x, y, w, h, 18);
  clearShadow();

  fill(96, 64, 39);
  textAlign(LEFT, TOP);
  textSize(16);
  textStyle(BOLD);
  text("Current Order", x + 14, y + 12);
  textStyle(NORMAL);

  if (!game.currentOrder) return;

  fill(122, 83, 50);
  textSize(20);
  textStyle(BOLD);
  text(game.currentOrder.drink, x + 14, y + 40);
  textStyle(NORMAL);

  textSize(14);
  const displaySteps = [...game.currentOrder.steps, "serve"];
  const nowIndex =
    game.state === STATES.SERVE_DRINK
      ? game.currentOrder.steps.length
      : min(game.stepIndex, game.currentOrder.steps.length);
  const serveDone =
    game.state === STATES.ORDER_COMPLETE || game.state === STATES.NEW_ORDER;

  for (let i = 0; i < displaySteps.length; i++) {
    const s = displaySteps[i];
    const done = i < nowIndex || (s === "serve" && serveDone);
    const now = i === nowIndex && !done;

    fill(
      done
        ? color(223, 242, 214, 230)
        : now
          ? color(255, 227, 188, 235)
          : color(246, 236, 221, 225),
    );
    rect(x + 14, y + 74 + i * 30, w - 28, 24, 12);

    fill(
      done ? color(86, 146, 82) : now ? color(191, 116, 58) : color(121, 86, 57),
    );
    if (now || done) textStyle(BOLD);
    text(`${i + 1}. ${labelStep(s)}`, x + 24, y + 80 + i * 30);
    textStyle(NORMAL);
  }
}

function drawQueuePanel() {
  // Removed from HUD to keep interface simpler.
}

function drawGuidePanel() {
  let msg = "";
  if (game.state === STATES.IDLE) msg = "Waiting for customer";
  if (game.state === STATES.ARM_SELECTION) msg = "Pick arm: W A S D";
  if (game.state === STATES.ARM_CONTROL) msg = `Move to ${labelStep(currentStep())}`;
  if (game.state === STATES.STEP_CHALLENGE) msg = challengeHint();
  if (game.state === STATES.STEP_SUCCESS) msg = "Step done";
  if (game.state === STATES.TANGLED) msg = "Tangled";
  if (game.state === STATES.UNTANGLE) msg = "Press SPACE to recover";
  if (game.state === STATES.SERVE_DRINK) {
    msg = game.selectedArm ? "Move to Serve" : "Pick arm to serve: W A S D";
  }
  if (game.state === STATES.ORDER_COMPLETE) msg = "Order complete";
  if (game.mode === "practice")
    msg = `Practice ${labelStep(game.practiceStep)}  |  Press Q to exit`;
  if (!msg) return;

  const w = min(360, width * 0.34);
  const h = 34;
  const x = width * 0.5 - w * 0.5;
  const y = 16;

  setShadow(8, "rgba(66,42,22,0.18)");
  fill(252, 245, 232, 226);
  rect(x, y, w, h, 999);
  clearShadow();

  fill(96, 64, 39);
  textAlign(CENTER, CENTER);
  textSize(13);
  textStyle(BOLD);
  text(msg, width * 0.5, y + h * 0.53);
  textStyle(NORMAL);
}

function challengeHint() {
  if (!game.challenge) return "";
  const step = currentStep();
  if (game.challenge.type === "timing") return `${labelStep(step)}: SPACE in target zone`;
  if (game.challenge.type === "hold") return `${labelStep(step)}: hold in center zone`;
  if (game.challenge.type === "sequence")
    return "Foam: follow key order (SPACE / E)";
  if (step === "ice") return "Ice: tap SPACE or E 3x";
  return `${labelStep(step)}: press SPACE or E`;
}

function drawChallengeUi() {
  const c = game.challenge;
  if (!c) return;

  setShadow(15, "rgba(66,42,22,0.2)");
  fill(252, 245, 232, 236);
  rect(width * 0.315, height * 0.73, width * 0.37, 105, 20);
  clearShadow();

  if (c.type === "timing") {
    const x = width * 0.34;
    const y = height * 0.795;
    const w = width * 0.32;
    fill(238, 223, 202);
    rect(x, y, w, 16, 999);
    fill(169, 135, 96);
    rect(x + c.zoneStart * w, y, c.zoneWidth * w, 16, 999);
    fill(98, 67, 43);
    circle(x + c.cursor * w, y + 8, 16);
  }
  if (c.type === "hold") {
    const x = width * 0.34;
    const y = height * 0.795;
    const w = width * 0.32;
    fill(238, 223, 202);
    rect(x, y, w, 20, 999);
    fill(169, 135, 96);
    rect(x + w * 0.28, y, w * 0.44, 20, 999);
    fill(98, 67, 43);
    circle(x + w * c.marker, y + 10, 18);
    fill(114, 82, 57);
    textAlign(CENTER, CENTER);
    textSize(13);
    text(
      `Hold ${c.hold.toFixed(2)} / ${c.needHold.toFixed(2)} s`,
      width * 0.5,
      height * 0.845,
    );
  }
  if (c.type === "sequence") {
    const x = width * 0.34;
    const y = height * 0.79;
    const keyW = 68;
    const gap = 14;
    const totalW = c.keys.length * keyW + (c.keys.length - 1) * gap;
    const startX = x + (width * 0.32 - totalW) * 0.5;

    for (let i = 0; i < c.keys.length; i++) {
      const done = i < c.index;
      const active = i === c.index;
      fill(done ? color(214, 239, 197) : active ? color(255, 225, 182) : color(245, 235, 222));
      rect(startX + i * (keyW + gap), y, keyW, 28, 10);
      fill(done ? color(87, 142, 76) : color(107, 77, 53));
      textAlign(CENTER, CENTER);
      textSize(12);
      textStyle(BOLD);
      text(c.keys[i], startX + i * (keyW + gap) + keyW * 0.5, y + 14);
    }
    textStyle(NORMAL);
    fill(114, 82, 57);
    textAlign(CENTER, CENTER);
    textSize(13);
    text(
      `Progress ${c.index}/${c.keys.length}   Mistakes ${c.mistakes}/${c.maxMistakes}`,
      width * 0.5,
      height * 0.845,
    );
  }
  if (c.type === "tap") {
    const step = currentStep();
    const label = step === "ice" ? "Ice cubes" : "Taps";
    fill(114, 82, 57);
    textAlign(CENTER, CENTER);
    textSize(20);
    textStyle(BOLD);
    text(`${label} ${c.taps}/${c.need}`, width * 0.5, height * 0.81);
    textStyle(NORMAL);
  }
}

function openChallengeGuide(step) {
  if (game.seenGuides[step]) return;
  game.seenGuides[step] = true;
  game.guidePopup.open = true;
  game.guidePopup.step = step;
  game.guidePopup.openedMs = millis();
}

function closeChallengeGuide() {
  if (!game.guidePopup.open) return;
  const paused = millis() - game.guidePopup.openedMs;
  if (game.challenge?.timeoutMs) game.challenge.timeoutMs += paused;
  game.guidePopup.open = false;
  game.guidePopup.step = null;
  game.guidePopup.openedMs = 0;
}

function guideCloseButtonRect() {
  const w = min(560, width * 0.6);
  const h = 260;
  const x = width * 0.5 - w * 0.5;
  const y = height * 0.5 - h * 0.5;
  return { x: x + w - 112, y: y + h - 48, w: 92, h: 32 };
}

function guideContent(step) {
  if (step === "coffee") {
    return ["Coffee Challenge", "Press SPACE when the moving dot is inside the target zone."];
  }
  if (step === "milk") {
    return [
      "Milk Challenge",
      "Hold SPACE (or mouse) while the marker stays in the center safe band.",
    ];
  }
  if (step === "ice") {
    return ["Ice Challenge", "Tap SPACE or E quickly 3 times before time runs out."];
  }
  if (step === "syrup") {
    return ["Syrup Challenge", "Precision timing: press SPACE exactly in the small target zone."];
  }
  if (step === "foam") {
    return [
      "Foam Challenge",
      "Follow the key sequence shown on screen.",
      "Use only SPACE and E in order.",
    ];
  }
  return ["Serve Challenge", "Tap SPACE or E to finish serving the drink."];
}

function drawChallengeGuidePopup() {
  const step = game.guidePopup.step;
  if (!step) return;
  const content = guideContent(step);
  const title = content[0];
  const lines = content.slice(1);

  fill(42, 28, 18, 145);
  rect(0, 0, width, height);

  const w = min(560, width * 0.6);
  const h = 260;
  const x = width * 0.5 - w * 0.5;
  const y = height * 0.5 - h * 0.5;

  setShadow(18, "rgba(66,42,22,0.2)");
  fill(252, 245, 232, 248);
  rect(x, y, w, h, 20);
  clearShadow();

  fill(96, 64, 39);
  textAlign(LEFT, TOP);
  textSize(24);
  textStyle(BOLD);
  text(title, x + 24, y + 24);
  textStyle(NORMAL);

  fill(124, 91, 64);
  textSize(16);
  let lineY = y + 74;
  for (const ln of lines) {
    text(ln, x + 24, lineY, w - 48);
    lineY += 34;
  }

  fill(144, 106, 74);
  textSize(13);
  text("Press ENTER / SPACE / C or click Close", x + 24, y + h - 36);

  const b = guideCloseButtonRect();
  fill(176, 122, 75);
  rect(b.x, b.y, b.w, b.h, 999);
  fill(252, 245, 232);
  textAlign(CENTER, CENTER);
  textSize(14);
  textStyle(BOLD);
  text("Close", b.x + b.w * 0.5, b.y + b.h * 0.53);
  textStyle(NORMAL);
}

function drawUntangleUi() {
  setShadow(15, "rgba(0,0,0,0.2)");
  fill(255, 255, 255, 245);
  rect(width * 0.39, height * 0.12, width * 0.22, 64, 20);
  clearShadow();

  fill(66, 81, 124);
  textAlign(CENTER, CENTER);
  textSize(15);
  textStyle(BOLD);
  text("Untangle Progress", width * 0.5, height * 0.145);
  textStyle(NORMAL);

  fill(226, 232, 249);
  rect(width * 0.41, height * 0.164, width * 0.18, 14, 999);
  fill(239, 146, 102);
  rect(
    width * 0.41,
    height * 0.164,
    (width * 0.18 * game.untangleProgress) / 100,
    14,
    999,
  );
}

function drawParticles() {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.03;
    p.life -= 1;
    fill(
      red(p.col),
      green(p.col),
      blue(p.col),
      map(p.life, 0, p.maxLife, 0, 230),
    );
    circle(p.x, p.y, p.size);
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

function addParticles(x, y, col, count) {
  for (let i = 0; i < count; i++) {
    game.particles.push({
      x,
      y,
      vx: random(-1.5, 1.5),
      vy: random(-2, -0.5),
      size: random(5, 10),
      life: random(25, 45),
      maxLife: 45,
      col,
    });
  }
}

function gameOverPanelRect() {
  const panelW = min(760, width * 0.74);
  const panelH = min(620, height * 0.86);
  const panelX = width * 0.5 - panelW * 0.5;
  const panelY = height * 0.5 - panelH * 0.5;
  return { panelX, panelY, panelW, panelH };
}

function gameOverRestartRect() {
  const { panelY, panelH } = gameOverPanelRect();
  const btnY = panelY + panelH - 76;
  return { x: width * 0.5 - 170, y: btnY, w: 340, h: 48 };
}

function gameOverCycleButtons() {
  const { panelY, panelH } = gameOverPanelRect();
  const y = panelY + panelH - 130;
  const w = 152;
  const h = 34;
  const gap = 12;
  const total = w * 4 + gap * 3;
  const x0 = width * 0.5 - total * 0.5;
  return [
    { key: "hats", hint: "H", label: `Hat: ${labelUnlockValue(profile?.selected?.hat)}`, x: x0 + 0 * (w + gap), y, w, h },
    { key: "cupSkins", hint: "J", label: `Cup: ${labelUnlockValue(profile?.selected?.cupSkin)}`, x: x0 + 1 * (w + gap), y, w, h },
    { key: "stationThemes", hint: "K", label: `Theme: ${labelUnlockValue(profile?.selected?.stationTheme)}`, x: x0 + 2 * (w + gap), y, w, h },
    { key: "soundPacks", hint: "L", label: `Sound: ${labelUnlockValue(profile?.selected?.soundPack)}`, x: x0 + 3 * (w + gap), y, w, h },
  ];
}

function drawGameOver() {
  fill(15, 23, 45, 220);
  rect(0, 0, width, height);

  const { panelX, panelY, panelW, panelH } = gameOverPanelRect();

  setShadow(40, "rgba(0,0,0,0.6)");
  fill(255, 255, 255, 248);
  rect(panelX, panelY, panelW, panelH, 24);
  clearShadow();

  fill(235, 242, 255);
  rect(panelX, panelY, panelW, 90, 24, 24, 0, 0);

  const grade = finalGrade();
  const stampScale = constrain(
    map(millis() - game.stateStartMs, 0, 400, 3, 1),
    1,
    3,
  );

  fill(37, 52, 90);
  textAlign(CENTER, CENTER);
  textSize(42);
  textStyle(BOLD);
  text("Shift Complete", width * 0.5, panelY + 48);
  textStyle(NORMAL);

  push();
  translate(width * 0.5, panelY + 140);
  scale(stampScale);
  if (stampScale === 1) setShadow(15, "rgba(0,0,0,0.2)");
  fill(
    grade === "S"
      ? color(255, 215, 0)
      : grade === "A"
        ? color(75, 192, 118)
        : grade === "B"
          ? color(87, 153, 222)
          : color(222, 91, 96),
  );
  ellipse(0, 0, 118, 118);
  fill(255);
  textSize(56);
  textStyle(BOLD);
  text(`${grade}`, 0, 0);
  pop();
  clearShadow();

  const statsY = panelY + 208;
  const statsW = panelW - 64;
  const statsX = panelX + 32;
  fill(246, 250, 255);
  rect(statsX, statsY, statsW, 120, 14);

  fill(37, 52, 90);
  textSize(20);
  textStyle(BOLD);
  text(`Orders: ${game.ordersDone}   |   Final Score: ${floor(game.score)}`, width * 0.5, statsY + 28);
  textStyle(NORMAL);
  textSize(16);
  fill(90, 110, 150);
  text(`Mistakes: ${game.mistakes}   |   Tangles: ${game.tangles}   |   Best Combo: x${game.bestCombo}`, width * 0.5, statsY + 62);

  const progressY = statsY + 138;
  fill(241, 247, 235, 238);
  rect(statsX, progressY, statsW, 146, 14);

  fill(88, 120, 64);
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(17);
  text("Progression", statsX + 16, progressY + 12);
  textStyle(NORMAL);
  textSize(14);
  if (profile) {
    fill(70, 92, 134);
    text(
      `Best Run  Score ${profile.bestScore}  |  Orders ${profile.bestOrders}`,
      statsX + 16,
      progressY + 40,
    );
    text(
      `Loadout: ${labelUnlockValue(profile.selected.hat)} | ${labelUnlockValue(profile.selected.cupSkin)} | ${labelUnlockValue(profile.selected.stationTheme)} | ${labelUnlockValue(profile.selected.soundPack)}`,
      statsX + 16,
      progressY + 62,
      statsW - 32,
      40,
    );
  }
  fill(78, 104, 58);
  textStyle(BOLD);
  text("New Unlocks:", statsX + 16, progressY + 92);
  textStyle(NORMAL);
  const unlockText =
    game.newUnlocks && game.newUnlocks.length
      ? game.newUnlocks.join(" | ")
      : "No new unlocks this round.";
  text(unlockText, statsX + 126, progressY + 92, statsW - 142, 42);
  textAlign(CENTER, CENTER);

  const cycleButtons = gameOverCycleButtons();
  for (const b of cycleButtons) {
    const hover =
      mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h;
    fill(hover ? color(221, 234, 250) : color(232, 240, 251));
    rect(b.x, b.y, b.w, b.h, 10);
    fill(67, 89, 124);
    textAlign(CENTER, CENTER);
    textSize(12);
    textStyle(BOLD);
    text(`${b.label}`, b.x + b.w * 0.5, b.y + 14);
    textStyle(NORMAL);
    textSize(11);
    fill(96, 116, 149);
    text(`[${b.hint}]`, b.x + b.w * 0.5, b.y + 25);
  }

  const pulse = sin(millis() * 0.005) * 5;
  setShadow(10, "rgba(87, 153, 222, 0.4)");
  fill(236, 244, 255);
  const restart = gameOverRestartRect();
  rect(
    restart.x - pulse / 2,
    restart.y - pulse / 2,
    restart.w + pulse,
    restart.h + pulse,
    999,
  );
  clearShadow();

  fill(46, 66, 111);
  textSize(16);
  textStyle(BOLD);
  text("SPACE: Restart", width * 0.5, restart.y + 24);
  textSize(13);
  textStyle(NORMAL);
  text("Click buttons above or use H/J/K/L keys", width * 0.5, panelY + panelH - 22);
  textStyle(NORMAL);
}

function finalGrade() {
  const s =
    game.score +
    game.ordersDone * 85 +
    game.bestCombo * 10 -
    game.mistakes * 14 -
    game.tangles * 16;
  if (s > 760) return "S";
  if (s > 560) return "A";
  if (s > 360) return "B";
  return "C";
}

function labelStep(step) {
  if (step === "coffee") return "Coffee";
  if (step === "milk") return "Milk";
  if (step === "ice") return "Ice";
  if (step === "syrup") return "Syrup";
  if (step === "foam") return "Foam";
  if (step === "serve") return "Serve";
  return "";
}

function drawIngredientIcon(step, x, y, size) {
  const cupSkin = profile?.selected?.cupSkin || "classic";
  const cupFill =
    cupSkin === "gold"
      ? color(244, 210, 136)
      : cupSkin === "ceramic"
        ? color(243, 243, 238)
        : color(239, 248, 255);
  const cupLine =
    cupSkin === "gold"
      ? color(189, 149, 75)
      : cupSkin === "ceramic"
        ? color(170, 176, 188)
        : color(127, 166, 211);
  push();
  translate(x, y);
  noStroke();
  if (step === "coffee") {
    fill(cupFill);
    rect(-size * 0.26, -size * 0.26, size * 0.52, size * 0.62, 7);
    fill(95, 65, 42);
    ellipse(0, 2, size * 0.78, size * 0.5);
    fill(245, 232, 204);
    ellipse(0, 0, size * 0.5, size * 0.28);
    stroke(cupLine);
    strokeWeight(2);
    noFill();
    arc(size * 0.31, 2, size * 0.24, size * 0.24, -HALF_PI, HALF_PI);
    noStroke();
  } else if (step === "milk") {
    fill(233, 246, 255);
    rect(-size * 0.22, -size * 0.26, size * 0.44, size * 0.56, 6);
    fill(176, 214, 241);
    quad(
      -size * 0.22,
      -size * 0.26,
      size * 0.22,
      -size * 0.26,
      size * 0.14,
      -size * 0.45,
      -size * 0.14,
      -size * 0.45,
    );
  } else if (step === "ice") {
    fill(171, 229, 255);
    rect(-size * 0.25, -size * 0.25, size * 0.25, size * 0.25, 4);
    rect(-size * 0.02, -size * 0.12, size * 0.25, size * 0.25, 4);
    rect(-size * 0.18, size * 0.07, size * 0.25, size * 0.25, 4);
  } else if (step === "syrup") {
    fill(228, 162, 96);
    rect(-size * 0.18, -size * 0.2, size * 0.36, size * 0.5, 7);
    fill(255, 207, 142);
    rect(-size * 0.11, -size * 0.34, size * 0.22, size * 0.12, 3);
    fill(188, 93, 54);
    ellipse(0, size * 0.03, size * 0.16, size * 0.3);
  } else if (step === "foam") {
    fill(cupFill);
    ellipse(0, -size * 0.05, size * 0.6, size * 0.35);
    ellipse(-size * 0.16, size * 0.02, size * 0.35, size * 0.25);
    ellipse(size * 0.16, size * 0.03, size * 0.35, size * 0.25);
    fill(cupLine);
    rect(-size * 0.24, size * 0.05, size * 0.48, size * 0.24, 5);
  } else if (step === "serve") {
    fill(cupFill);
    rect(-size * 0.24, -size * 0.25, size * 0.48, size * 0.6, 6);
    fill(cupLine);
    rect(-size * 0.13, -size * 0.15, size * 0.26, size * 0.04, 3);
    rect(-size * 0.13, -size * 0.03, size * 0.26, size * 0.04, 3);
    rect(-size * 0.13, size * 0.09, size * 0.26, size * 0.04, 3);
  } else {
    fill(90, 110, 160);
    circle(0, 0, size * 0.3);
  }
  pop();
}
