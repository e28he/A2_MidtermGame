const GAME = {
  width: 1280,
  height: 720,
  durationSec: 120,
  targetOrders: 8,
};

const STATES = {
  IDLE: "IDLE",
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

let game;
let audioEngine = null;
let musicTimer = null;
let musicStep = 0;
let audioUnlocked = false;
let startOverlayEl = null;
let openingVideoEl = null;
let startButtonEl = null;

// --- Helper Functions for Aesthetics ---
function setShadow(blur, clr) {
  drawingContext.shadowBlur = blur;
  drawingContext.shadowColor = clr;
}
function clearShadow() {
  drawingContext.shadowBlur = 0;
}

function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("app");
  textFont("Avenir Next");
  bindStartOverlay();
  resetGame();
}

function bindStartOverlay() {
  startOverlayEl = document.getElementById("start-overlay");
  openingVideoEl = document.getElementById("opening-video");
  startButtonEl = document.getElementById("start-button");

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
    armTip: createVector(width * 0.5, height * 0.45),
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
  };
  
  for(let i=0; i<20; i++) {
    game.bubbles.push({
      x: random(width), y: random(height),
      s: random(10, 40), speed: random(0.5, 2)
    });
  }
  showStartOverlay();
}

function startShift() {
  if (!game.roundStartMs) game.roundStartMs = millis();
  game.state = STATES.NEW_ORDER;
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

  audioEngine.ctx.resume().then(() => {
    audioUnlocked = true;
    playTone(520, 0.03, "sine", 0.001);
  }).catch(() => {});
}

// --- Audio Engine ---
function startAudioEngine() {
  if (audioEngine && audioEngine.ctx && audioEngine.ctx.state === "running") return;
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
  if (!audioEngine || !audioEngine.ctx || game.state === STATES.IDLE) return;
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
  if (kind === "start") {
    playTone(392, 0.15, "triangle", 0.08);
    playTone(523.25, 0.25, "sine", 0.08, 0.1);
  } else if (kind === "select") {
    playTone(440, 0.08, "square", 0.02);
  } else if (kind === "success") {
    playTone(523.25, 0.1, "sine", 0.06);
    playTone(659.25, 0.15, "triangle", 0.05, 0.05);
  } else if (kind === "fail") {
    playTone(180, 0.15, "sawtooth", 0.04);
    playTone(130, 0.25, "sawtooth", 0.05, 0.05);
  } else if (kind === "untangle") {
    playTone(320 + random(-20, 40), 0.05, "square", 0.02);
  } else if (kind === "serve") {
    playTone(523.25, 0.1, "triangle", 0.05);
    playTone(659.25, 0.1, "triangle", 0.05, 0.06);
    playTone(783.99, 0.2, "sine", 0.06, 0.12);
  }
}

function draw() {
  updateGlobalMeters();
  updateState();

  drawBackdrop();
  drawScene();
  drawStations();
  drawArms();
  drawOctopus();

  drawHeader();
  drawOrderCard();
  drawQueuePanel();
  drawGuidePanel();

  drawParticles();

  if (game.state === STATES.IDLE) drawStartOverlay();
  if (game.state === STATES.STEP_CHALLENGE) drawChallengeUi();
  if (game.state === STATES.UNTANGLE || game.state === STATES.TANGLED) drawUntangleUi();
  if (game.state === STATES.GAME_OVER) drawGameOver();
}

function startButtonRect() {
  return { x: width * 0.41, y: height * 0.65, w: width * 0.18, h: 56 };
}

function drawStartOverlay() {
  fill(13, 22, 44, 210);
  rect(0, 0, width, height);

  noStroke();
  for(let b of game.bubbles) {
    b.y -= b.speed;
    if(b.y < -50) b.y = height + 50;
    fill(120, 190, 255, 30);
    circle(b.x + sin(millis()*0.001 + b.x)*20, b.y, b.s);
  }

  setShadow(30, 'rgba(0,0,0,0.5)');
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
  text("You know the recipe, but your body won't cooperate.", width * 0.5, height * 0.30);

  textSize(16);
  textAlign(LEFT, TOP);
  fill(42, 65, 118);
  const startX = width * 0.32;
  const startY = height * 0.38;
  const spacing = 35;
  
  text("🐙  W A S D : Select tentacle", startX, startY);
  text("🎯  Mouse : Aim tentacle", startX, startY + spacing);
  text("⚡  SPACE : Challenge / Untangle", startX, startY + spacing * 2);
  text("🧘  Hold R : Calm tangle meter   |   🔊 M : Mute", startX, startY + spacing * 3);
  text("⏱️  Goal: Finish 8 orders before shift ends", startX, startY + spacing * 4.5);
  text("🔥  Tip: Keep a rhythm to build combo bonus", startX, startY + spacing * 5.2);

  const b = startButtonRect();
  const hover = mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h;
  const pulse = sin(millis() * 0.004) * 4;
  
  setShadow(hover ? 20 : 10, hover ? 'rgba(83, 189, 123, 0.6)' : 'rgba(87, 153, 222, 0.4)');
  fill(hover ? color(83, 189, 123) : color(87, 153, 222));
  rect(b.x - pulse/2, b.y - pulse/2, b.w + pulse, b.h + pulse, 999);
  clearShadow();
  
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  textStyle(BOLD);
  text("Start Shift", b.x + b.w * 0.5, b.y + b.h * 0.5);
  textStyle(NORMAL);
}

function updateGlobalMeters() {
  if (game.state === STATES.GAME_OVER) return;
  const dt = deltaTime / 1000;
  if (millis() - game.noInputSince > 1000 && game.state !== STATES.STEP_CHALLENGE) {
    game.tangleMeter = max(0, game.tangleMeter - 20 * dt);
  }
  if (keyIsDown(82)) {
    game.tangleMeter = max(0, game.tangleMeter - 34 * dt);
  }
  game.stress = constrain(game.stress - 3.5 * dt, 0, 100);
  const elapsed = game.roundStartMs ? (millis() - game.roundStartMs) / 1000 : 0;
  if (game.roundStartMs && (elapsed >= GAME.durationSec || game.ordersDone >= GAME.targetOrders)) {
    game.state = STATES.GAME_OVER;
  }
  if (game.tangleMeter >= 80 && !game.lockedArm) {
    const arms = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
    game.lockedArm = random(arms);
    if (game.selectedArm === game.lockedArm) game.selectedArm = null;
  }
  if (game.tangleMeter < 60 && game.state !== STATES.TANGLED && game.state !== STATES.UNTANGLE) {
    game.lockedArm = null;
  }
}

function updateState() {
  switch (game.state) {
    case STATES.IDLE: break;
    case STATES.NEW_ORDER:
      createOrder(); game.state = STATES.ARM_SELECTION; game.stateStartMs = millis(); break;
    case STATES.ARM_SELECTION:
      if (game.selectedArm) { game.state = STATES.ARM_CONTROL; game.stateStartMs = millis(); } break;
    case STATES.ARM_CONTROL: updateArmReach(); break;
    case STATES.STEP_CHALLENGE: updateChallenge(); break;
    case STATES.STEP_SUCCESS:
      if (millis() - game.stateStartMs > 350) {
        if (game.stepIndex >= game.currentOrder.steps.length) { game.selectedArm = null; game.state = STATES.SERVE_DRINK; } 
        else { game.state = STATES.ARM_SELECTION; }
        game.stateStartMs = millis();
      } break;
    case STATES.TANGLED:
      if (millis() - game.stateStartMs > 250) { game.state = STATES.UNTANGLE; game.stateStartMs = millis(); } break;
    case STATES.UNTANGLE: updateUntangleState(); break;
    case STATES.SERVE_DRINK: if (game.selectedArm) updateArmReach(); break;
    case STATES.ORDER_COMPLETE:
      if (millis() - game.stateStartMs > 900) { game.state = STATES.NEW_ORDER; game.stateStartMs = millis(); } break;
  }
}

function createOrder() {
  const elapsed = game.roundStartMs ? (millis() - game.roundStartMs) / 1000 : 0;
  let pool;
  if (elapsed < 25) pool = ["Americano", "Latte"];
  else if (elapsed < 70) pool = ["Americano", "Latte", "Iced Latte"];
  else pool = ["Americano", "Latte", "Iced Latte", "Mocha", "Iced Mocha"];
  const drink = random(pool);
  game.currentOrder = {
    drink, steps: [...RECIPES[drink]], createdMs: millis(),
    startTangles: game.tangles, startWrongHits: game.wrongStationHits, startArmSwitches: game.armSwitches,
  };
  game.stepIndex = 0; game.selectedArm = null; game.challenge = null; game.hoverStation = null;
}

function currentStep() { return (!game.currentOrder) ? null : game.currentOrder.steps[game.stepIndex] || null; }
function requiredStation() { return game.state === STATES.SERVE_DRINK ? "serve" : currentStep(); }

function updateArmReach() {
  const base = armBase(game.selectedArm);
  const desired = createVector(mouseX, mouseY).sub(base);
  const reachLimit = game.state === STATES.SERVE_DRINK ? width * 0.55 : width * 0.45;
  desired.limit(reachLimit);
  const target = p5.Vector.add(base, desired);
  game.armTip.lerp(target, 0.25);
  const required = requiredStation();
  if (!required) return;
  let touched = null;
  for (const name of STATION_NAMES) {
    const s = station(name);
    if (dist(game.armTip.x, game.armTip.y, s.x, s.y) <= s.r + 8) { touched = name; break; }
  }
  if (!touched) { game.hoverStation = null; return; }
  if (touched !== game.hoverStation) { game.hoverStation = touched; game.hoverSince = millis(); return; }
  if (millis() - game.hoverSince < 180) return;
  if (touched === required) {
    if (game.state === STATES.SERVE_DRINK) completeServeDrink();
    else beginChallenge(touched);
  } else {
    game.mistakes += 1; game.wrongStationHits += 1; game.combo = 0; game.score = max(0, game.score - 5);
    addTangle(touched, 8);
    addParticles(station(touched).x, station(touched).y, color(246, 149, 128), 8);
    game.hoverStation = null;
  }
}

function addTangle(stationName, base) {
  let gain = base; const now = millis();
  if (stationName === game.lastStation) gain += 6;
  if (game.lastStation && stationName !== game.lastStation && now - game.lastStationMs < 2000) gain += 10;
  if (game.stress > 70) gain *= 1.2;
  game.tangleMeter = constrain(game.tangleMeter + gain, 0, 100);
  game.stress = constrain(game.stress + 7, 0, 100);
  game.lastStation = stationName; game.lastStationMs = now;
}

function beginChallenge(step) {
  const lag = actionLag();
  if (step === "coffee") {
    game.challenge = { type: "timing", cursor: 0, dir: 1, zoneStart: random(0.25, 0.55), zoneWidth: 0.32, speed: 0.95 - lag * 0.22, timeoutMs: millis() + 2600 };
  } else if (step === "milk") {
    game.challenge = { type: "hold", marker: 0.5, hold: 0, needHold: 0.65 + lag * 0.12, timer: 0, maxTime: 3.2 };
  } else if (step === "ice") {
    game.challenge = { type: "rhythm", beatsHit: 0, beatsNeed: 2, nextBeat: millis() + 550, beatWindow: 260 + lag * 45, misses: 0, timeoutMs: millis() + 2600 };
  } else if (step === "syrup") {
    game.challenge = { type: "timing", cursor: 0, dir: 1, zoneStart: random(0.3, 0.58), zoneWidth: 0.22, speed: 1.05 - lag * 0.2, timeoutMs: millis() + 2100 };
  } else if (step === "foam") {
    game.challenge = { type: "hold", marker: 0.5, hold: 0, needHold: 0.85 + lag * 0.12, timer: 0, maxTime: 2.8 };
  } else {
    game.challenge = { type: "tap", taps: 0, need: 2, timeoutMs: millis() + 2200 };
  }
  addTangle(step, 5);
  game.state = STATES.STEP_CHALLENGE;
  game.stateStartMs = millis();
  game.hoverStation = null;
}

function updateChallenge() {
  const c = game.challenge;
  if (!c) return;
  const dt = deltaTime / 1000;
  if (c.type === "timing") {
    c.cursor += c.dir * c.speed * dt;
    if (c.cursor >= 1) { c.cursor = 1; c.dir = -1; }
    if (c.cursor <= 0) { c.cursor = 0; c.dir = 1; }
    if (millis() > c.timeoutMs) failStep();
  }
  if (c.type === "hold") {
    c.timer += dt;
    c.marker = 0.5 + sin(millis() * (0.0032 + game.stress * 0.00002)) * 0.32;
    const safe = c.marker > 0.28 && c.marker < 0.72;
    const holding = mouseIsPressed || keyIsDown(32);
    if (holding && safe) c.hold += dt * 1.1;
    else if (holding && !safe) c.hold = max(0, c.hold - 0.22 * dt);
    else c.hold = max(0, c.hold - 0.12 * dt);
    if (c.hold >= c.needHold) successStep();
    if (c.timer > c.maxTime) failStep();
  }
  if (c.type === "rhythm") {
    if (millis() > c.timeoutMs) failStep();
    if (millis() - c.nextBeat > c.beatWindow) {
      c.misses += 1; c.nextBeat = millis() + 550;
      if (c.misses >= 2) failStep();
    }
  }
  if (c.type === "tap") {
    if (c.taps >= c.need) successStep();
    if (millis() > c.timeoutMs) failStep();
  }
}

function successStep() {
  const waitSec = (millis() - game.currentOrder.createdMs) / 1000;
  const base = 45;
  const speedBonus = max(0, 24 - waitSec * 0.9);
  const precisionPenalty = game.mistakes * 1.1;
  game.combo += 1;
  game.bestCombo = max(game.bestCombo, game.combo);
  const comboBonus = min(30, (game.combo - 1) * 4);
  game.score += floor(base + speedBonus - precisionPenalty + comboBonus);
  playSfx("success");
  game.stepIndex += 1; game.selectedArm = null; game.challenge = null;
  game.state = STATES.STEP_SUCCESS; game.stateStartMs = millis();
}

function completeServeDrink() {
  const timeTaken = (millis() - game.currentOrder.createdMs) / 1000;
  const tangleDelta = game.tangles - game.currentOrder.startTangles;
  const wrongDelta = game.wrongStationHits - game.currentOrder.startWrongHits;
  const armDelta = game.armSwitches - game.currentOrder.startArmSwitches;
  const efficiencyPenalty = max(0, armDelta - (game.currentOrder.steps.length + 1));
  const serveScore = floor(100 - timeTaken * 1.8 - tangleDelta * 10 - wrongDelta * 2 - efficiencyPenalty);
  const rushBonus = timeTaken < 17 ? 20 : 0;
  game.score += max(25, serveScore) + rushBonus;
  game.ordersDone += 1; game.combo += 1; game.bestCombo = max(game.bestCombo, game.combo);
  addParticles(station("serve").x, station("serve").y, color(115, 210, 145), 18);
  playSfx("serve");
  game.state = STATES.ORDER_COMPLETE; game.stateStartMs = millis();
}

function failStep() {
  game.tangles += 1; game.mistakes += 1; game.score = max(0, game.score - 18);
  game.challenge = null; game.combo = 0; playSfx("fail"); game.untangleProgress = 0;
  game.state = STATES.TANGLED; game.stateStartMs = millis();
  game.tangleMeter = constrain(game.tangleMeter + 20, 0, 100);
  game.stress = constrain(game.stress + 14, 0, 100);
}

function updateUntangleState() {
  const dt = deltaTime / 1000;
  game.untangleProgress = max(0, game.untangleProgress - 10 * dt);
  if (game.untangleProgress >= 100) {
    game.tangleMeter = max(0, game.tangleMeter - 48);
    game.lockedArm = null; game.selectedArm = null;
    game.state = STATES.ARM_SELECTION; game.stateStartMs = millis();
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
  if (key.toUpperCase() === "M" && audioEngine?.master) {
    const muted = audioEngine.master.gain.value < 0.01;
    audioEngine.master.gain.value = muted ? 0.25 : 0.0001;
    return false;
  }
  if (game.state === STATES.IDLE && (key === " " || keyCode === ENTER)) { startShift(); return false; }
  if (game.state === STATES.GAME_OVER && key === " ") { resetGame(); return false; }
  if (game.state === STATES.ARM_SELECTION || game.state === STATES.ARM_CONTROL || game.state === STATES.SERVE_DRINK) {
    const k = key.toUpperCase();
    if (ARM_KEYS[k]) {
      const arm = ARM_KEYS[k];
      if (arm !== game.lockedArm) {
        game.selectedArm = arm; game.armTip = armBase(arm).copy();
        registerArmChange(); playSfx("select");
      }
      return false;
    }
    if (k === "X") {
      game.selectedArm = null; game.state = STATES.ARM_SELECTION; game.score = max(0, game.score - 4); return false;
    }
  }
  if (game.state === STATES.STEP_CHALLENGE) {
    const c = game.challenge; if (!c) return false;
    if (c.type === "timing" && key === " ") {
      const inZone = c.cursor >= c.zoneStart && c.cursor <= c.zoneStart + c.zoneWidth;
      if (inZone) successStep(); else failStep(); return false;
    }
    if (c.type === "rhythm" && key === " ") {
      const d = abs(millis() - c.nextBeat);
      if (d <= c.beatWindow) { c.beatsHit += 1; c.nextBeat = millis() + 550; if (c.beatsHit >= c.beatsNeed) successStep(); }
      else { c.misses += 1; if (c.misses >= 2) failStep(); }
      return false;
    }
    if (c.type === "tap" && (key === " " || key.toUpperCase() === "E")) { c.taps += 1; return false; }
  }
  if ((game.state === STATES.TANGLED || game.state === STATES.UNTANGLE) && key === " ") {
    game.untangleProgress += 14; playSfx("untangle"); return false;
  }
  return false;
}

function mousePressed() {
  game.noInputSince = millis(); ensureAudioUnlocked();
  if (game.state === STATES.IDLE) {
    const b = startButtonRect();
    if (mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h) startShift();
  }
}

function registerArmChange() {
  game.armSwitches += 1; const now = millis();
  game.selectedChanges.push(now);
  game.selectedChanges = game.selectedChanges.filter((t) => now - t < 1000);
  if (game.selectedChanges.length >= 4) {
    game.selectedChanges = []; game.stress = constrain(game.stress + 8, 0, 100);
    game.tangleMeter = constrain(game.tangleMeter + 6, 0, 100);
    addParticles(width - 150, height - 155, color(130, 200, 255), 10);
  }
}

function station(name) {
  const y = height * 0.57;
  const map = {
    coffee: { x: width * 0.17, y, r: 56, label: "Coffee" },
    milk: { x: width * 0.33, y, r: 56, label: "Milk" },
    ice: { x: width * 0.49, y, r: 56, label: "Ice" },
    syrup: { x: width * 0.65, y, r: 56, label: "Syrup" },
    foam: { x: width * 0.81, y, r: 56, label: "Foam" },
    serve: { x: width * 0.84, y: y - 104, r: 58, label: "Serve" },
  };
  return map[name];
}

function armBase(arm) {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5; const y = height * 0.44 + bob;
  const map = {
    topLeft: createVector(x - 90, y - 10), topRight: createVector(x + 90, y - 10),
    bottomLeft: createVector(x - 110, y + 40), bottomRight: createVector(x + 110, y + 40),
  };
  return map[arm] || createVector(x, y);
}

function drawBackdrop() {
  for (let y = 0; y < height; y += 4) {
    const t = y / height;
    const c = lerpColor(color(255, 248, 230), color(228, 241, 255), t);
    stroke(c); strokeWeight(4); line(0, y, width, y);
  }
  noStroke();
  if (game.tangleMeter >= 50) {
    push(); noFill();
    stroke(game.tangleMeter >= 80 ? color(125, 65, 84, 92) : color(233, 149, 85, 75));
    strokeWeight(3);
    for (let i = 0; i < 11; i++) {
      beginShape();
      for (let x = -40; x <= width + 40; x += 28) {
        const yy = 128 + i * 40 + sin(0.012 * x + i + millis() * 0.0018) * (10 + game.tangleMeter * 0.12);
        curveVertex(x, yy);
      }
      endShape();
    }
    pop();
  }
}

function drawScene() {
  const cy = height * 0.62;
  setShadow(15, 'rgba(0,0,0,0.1)');
  fill(250, 248, 240, 180);
  rect(56, 92, width - 112, 360, 14); 
  
  fill(205, 226, 248, 170);
  rect(96, 120, 180, 140, 10); 
  clearShadow();
  
  stroke(170, 191, 219); strokeWeight(4);
  line(186, 120, 186, 260); line(96, 190, 276, 190); noStroke();

  fill(212, 176, 133); rect(width - 370, 132, 250, 16, 8); 
  fill(140, 176, 216); rect(width - 350, 102, 22, 30, 6);
  fill(248, 228, 190); ellipse(width - 306, 118, 26, 26);

  setShadow(10, 'rgba(0,0,0,0.2)');
  fill(215, 158, 116);
  rect(80, cy, width - 160, 120, 12); 
  fill(240, 188, 138);
  rect(70, cy - 28, width - 140, 34, 12);
  clearShadow();

  drawLamp(width * 0.2, 58); drawLamp(width * 0.5, 58); drawLamp(width * 0.8, 58);
}

function drawLamp(x, y) {
  fill(255, 238, 189, 125); ellipse(x, y + 38, 150, 95);
  fill(255, 225, 158); circle(x, y, 16);
}

function drawStations() {
  const req = requiredStation();
  for (const name of STATION_NAMES) {
    const s = station(name);
    const required = name === req;
    const touched = name === game.hoverStation && (game.state === STATES.ARM_CONTROL || game.state === STATES.SERVE_DRINK);

    setShadow(8, 'rgba(0,0,0,0.15)');
    fill(required ? color(168, 230, 188) : color(226, 238, 255));
    if (touched) fill(255, 240, 190);
    rect(s.x - 60, s.y - 52, 120, 100, 16);
    clearShadow();

    fill(name === "serve" ? color(95, 180, 118) : color(113, 140, 201));
    circle(s.x + 36, s.y - 32, 18);

    drawIngredientIcon(name, s.x - 2, s.y - 8, 34);
    textSize(14); textStyle(BOLD); fill(30, 44, 78);
    text(s.label, s.x, s.y + 52); textStyle(NORMAL);

    if (required) {
      noFill(); stroke(90, 189, 126); strokeWeight(4);
      circle(s.x, s.y - 2, 134); noStroke();
    }
  }
}

function drawArms() {
  const arms = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
  const level = game.tangleMeter >= 80 ? "full" : game.tangleMeter >= 50 ? "half" : "normal";

  for (const arm of arms) {
    const base = armBase(arm); let tip = defaultArmTip(arm);
    if (arm === game.selectedArm && game.state === STATES.ARM_CONTROL) tip = game.armTip.copy();

    // Synced to the new glossy blue/purple palette
    let armColor = color(135, 206, 255); 
    let outlineCol = color(75, 77, 135); 
    
    if (arm === game.lockedArm) armColor = color(152, 173, 255); 

    setShadow(10, 'rgba(0,0,0,0.2)');
    stroke(outlineCol); strokeWeight(42); noFill(); 
    const kx = (base.x + tip.x) * 0.5;
    const ky = (base.y + tip.y) * 0.5 + sin(millis() * 0.005 + base.x * 0.01) * (level === "full" ? 24 : level === "half" ? 16 : 8);
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);
    clearShadow();

    stroke(armColor); strokeWeight(34);
    bezier(base.x, base.y, kx, ky, kx, ky, tip.x, tip.y);

    // Shiny purple-blue suction cups
    noStroke(); fill(220, 225, 255, 180); 
    circle(base.x - 10, base.y + 10, 14);
    circle(base.x + 10, base.y + 5, 12);
  }
}

// THE NEW GLOSSY BLUE/PURPLE OCTOPUS
function drawOctopus() {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5; const y = height * 0.43 + bob;
  const mode = game.state === STATES.TANGLED || game.state === STATES.UNTANGLE || game.tangleMeter >= 80 ? "full" : game.tangleMeter >= 50 ? "half" : "normal";

  setShadow(15, 'rgba(0,0,0,0.3)');
  
  // Create HTML5 Canvas Linear Gradient for that smooth, glass-like look
  let grad = drawingContext.createLinearGradient(0, y - 140, 0, y + 120);
  grad.addColorStop(0, '#B399FF');   // Soft purple at the top
  grad.addColorStop(0.5, '#7DD1FF'); // Bright cyan blue in the middle
  grad.addColorStop(1, '#9E94FF');   // Deep soft purple at the tentacles

  drawingContext.fillStyle = grad;
  drawingContext.strokeStyle = '#4B4D87'; // Dark indigo outline
  drawingContext.lineWidth = 4;

  // Skirt bumps
  for (let i = 0; i < 5; i++) {
     ellipse(x - 100 + i * 50, y + 90, 60, 60);
  }

  // Main Head Shape
  ellipse(x, y, 260, 240); 
  clearShadow();

  // Glossy Highlights
  noStroke();
  fill(255, 255, 255, 220); // Bright white gloss
  
  push();
  translate(x - 50, y - 80);
  rotate(-PI/8);
  ellipse(0, 0, 75, 35); // Main big reflection
  pop();

  fill(255, 255, 255, 150); // Softer dots
  circle(x + 70, y - 60, 12);
  circle(x + 90, y - 30, 8);
  circle(x + 85, y - 10, 5);

  drawFace(x, y, mode);
}

function drawFace(x, y, mode) {
  if (mode === "full") {
    drawSpiralEye(x - 55, y + 15); drawSpiralEye(x + 55, y + 15);
    fill(40, 45, 80); ellipse(x, y + 45, 26, 12); 
    return;
  }

  // Large Dark Navy Eyes
  fill(35, 35, 60); noStroke();
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
  noFill(); stroke(35, 35, 60); strokeWeight(3);
  if (mode === "half") {
     line(x - 8, y + 30, x + 8, y + 30);
     // Sweat drop for warning state
     fill(160, 220, 255); noStroke();
     push(); translate(x + 85, y - 15); rotate(-PI/6);
     ellipse(0, 0, 12, 22); pop();
  } else {
     arc(x, y + 25, 16, 12, 0, PI);
  }
  noStroke();
}

function drawSpiralEye(x, y) {
  noFill(); stroke(58, 35, 93); strokeWeight(4);
  beginShape();
  for (let a = 0; a < TWO_PI * 2.1; a += 0.2) { const r = map(a, 0, TWO_PI * 2.1, 2, 14); vertex(x + cos(a) * r, y + sin(a) * r); }
  endShape(); noStroke();
}

function defaultArmTip(arm) {
  const bob = sin(millis() * 0.002) * 10;
  const x = width * 0.5; const y = height * 0.43 + bob; const t = millis() * 0.002;
  if (arm === "topLeft") return createVector(x - 180 + sin(t) * 14, y - 70 + cos(t * 1.2) * 8);
  if (arm === "topRight") return createVector(x + 180 + cos(t * 1.1) * 14, y - 70 + sin(t * 0.9) * 8);
  if (arm === "bottomLeft") return createVector(x - 200 + sin(t * 1.3) * 15, y + 80 + cos(t) * 7);
  return createVector(x + 200 + cos(t * 1.15) * 15, y + 80 + sin(t) * 7);
}

// ... UI PANELS ...
function drawHeader() {
  const elapsed = game.roundStartMs ? floor((millis() - game.roundStartMs) / 1000) : 0;
  const left = max(0, GAME.durationSec - elapsed);

  setShadow(20, 'rgba(100, 150, 255, 0.15)');
  fill(255, 255, 255, 245);
  rect(20, 20, 390, 140, 24);
  clearShadow();

  fill(131, 197, 255);
  rect(20, 20, 12, 140, 24, 0, 0, 24);

  fill(40, 60, 90); textAlign(LEFT, TOP); textSize(22); textStyle(BOLD);
  text("☕ Shift Status", 45, 30); textStyle(NORMAL);

  fill(240, 245, 255); rect(260, 28, 130, 30, 15);
  fill(100, 140, 200); textSize(16); textStyle(BOLD);
  text(`⏱ ${nf(floor(left / 60), 2)}:${nf(left % 60, 2)}`, 275, 34);

  textSize(15); textStyle(NORMAL); fill(80, 100, 130);
  text(`Orders:`, 45, 65); fill(40, 60, 90); textStyle(BOLD); text(`${game.ordersDone} / ${GAME.targetOrders}`, 105, 65);
  textStyle(NORMAL); fill(80, 100, 130);
  text(`Score:`, 180, 65); fill(40, 60, 90); textStyle(BOLD); text(`${floor(game.score)}`, 230, 65);
  
  textStyle(NORMAL); fill(80, 100, 130);
  text(`Combo:`, 45, 90); fill(255, 150, 80); textStyle(BOLD); text(`x${game.combo}`, 105, 90);
  textStyle(NORMAL); fill(80, 100, 130);
  text(`Mistakes:`, 180, 90); fill(220, 100, 100); textStyle(BOLD); text(`${game.mistakes}`, 250, 90);

  textStyle(NORMAL); fill(80, 100, 130); textSize(14);
  text("Stress", 45, 120);
  drawMeter(100, 122, 290, 14, game.stress, color(131, 197, 255), color(255, 120, 120));

  drawTangleBar(width - 430, 20, 410, 140);
}

function drawMeter(x, y, w, h, v, c1, c2) {
  fill(235, 240, 250); rect(x, y, w, h, 999);
  fill(lerpColor(c1, c2, v / 100)); rect(x, y, (w * v) / 100, h, 999);
}

function drawTangleBar(x, y, w, h) {
  setShadow(20, 'rgba(100, 150, 255, 0.15)');
  fill(255, 255, 255, 245); rect(x, y, w, h, 24); clearShadow();
  
  fill(40, 60, 90); textAlign(LEFT, TOP); textSize(20); textStyle(BOLD);
  text("🐙 Tangle Meter", x + 25, y + 25); textStyle(NORMAL);

  const bx = x + 25; const by = y + 65; const bw = w - 50; const bh = 22;
  fill(235, 240, 250); rect(bx, by, bw, bh, 999);

  const t = game.tangleMeter / 100;
  const cA = color(131, 197, 255); const cB = color(255, 180, 100); const cC = color(255, 100, 100);
  fill(t < 0.5 ? lerpColor(cA, cB, t * 2) : lerpColor(cB, cC, (t - 0.5) * 2));
  rect(bx, by, bw * t, bh, 999);

  noFill(); stroke(255, 255, 255, 150); strokeWeight(3);
  beginShape();
  for (let i = 0; i <= 100; i++) {
    const xx = map(i, 0, 100, bx + 4, bx + bw - 4);
    const yy = by + bh * 0.5 + sin(i * 0.3) * (1.5 + game.tangleMeter * 0.04);
    curveVertex(xx, yy);
  }
  endShape(); noStroke();

  fill(80, 100, 130); textSize(13);
  text("0-49: Good | 50-79: Warning | 80-100: Locked!", x + 25, y + 105);
  text("Hold 'R': Deep Breath (Calm down)", x + 25, y + 123);
}

function drawOrderCard() {
  setShadow(15, 'rgba(0,0,0,0.1)');
  fill(255, 255, 255, 240); rect(20, height - 214, 360, 194, 20); clearShadow();

  fill(35, 52, 95); textAlign(LEFT, TOP); textSize(18); textStyle(BOLD);
  text("Order Card", 34, height - 202); textStyle(NORMAL);

  if (!game.currentOrder) return;

  textSize(24); textStyle(BOLD); text(game.currentOrder.drink, 34, height - 172); textStyle(NORMAL);

  textSize(16);
  const displaySteps = [...game.currentOrder.steps, "serve"];
  const nowIndex = game.state === STATES.SERVE_DRINK ? game.currentOrder.steps.length : min(game.stepIndex, game.currentOrder.steps.length);
  const serveDone = game.state === STATES.ORDER_COMPLETE || game.state === STATES.NEW_ORDER;

  for (let i = 0; i < displaySteps.length; i++) {
    const s = displaySteps[i]; const done = i < nowIndex || (s === "serve" && serveDone); const now = i === nowIndex && !done;
    fill(done ? color(44, 166, 97) : now ? color(237, 141, 84) : color(91, 108, 151));
    if(now) textStyle(BOLD);
    text(`${done ? "✔" : now ? "→" : "•"} ${labelStep(s)}`, 36, height - 132 + i * 25);
    textStyle(NORMAL);
  }
}

function drawQueuePanel() {
  setShadow(15, 'rgba(0,0,0,0.1)');
  fill(255, 255, 255, 240); rect(width - 300, height - 214, 280, 194, 20); clearShadow();

  fill(35, 52, 95); textAlign(LEFT, TOP); textSize(18); textStyle(BOLD);
  text("Action Queue", width - 286, height - 202); textStyle(NORMAL);

  if (!game.currentOrder) return;

  const pending = [];
  for (let i = game.stepIndex; i < game.currentOrder.steps.length && pending.length < 3; i++) { pending.push(game.currentOrder.steps[i]); }
  if (game.state === STATES.SERVE_DRINK && pending.length < 3) pending.unshift("serve");

  for (let i = 0; i < 3; i++) {
    const x = width - 286 + i * 86; const y = height - 164;
    fill(238, 244, 255); rect(x, y, 74, 74, 16);
    if (pending[i]) {
      drawIngredientIcon(pending[i], x + 37, y + 36, 30);
      fill(59, 79, 138); textAlign(CENTER, CENTER); textSize(11); textStyle(BOLD);
      text(labelStep(pending[i]), x + 37, y + 59); textStyle(NORMAL);
    }
  }
  fill(75, 91, 132); textAlign(LEFT, TOP); textSize(12);
  text("W/A/S/D select arm | X clear arm", width - 286, height - 84);
  text("SPACE in challenge | SPACE mash untangle", width - 286, height - 68);
}

function drawGuidePanel() {
  let msg = "";
  if (game.state === STATES.IDLE) msg = "Waiting for customer...";
  if (game.state === STATES.ARM_SELECTION) msg = "Choose one tentacle (W/A/S/D)";
  if (game.state === STATES.ARM_CONTROL) msg = `Reach ${labelStep(currentStep())}`;
  if (game.state === STATES.STEP_CHALLENGE) msg = challengeHint();
  if (game.state === STATES.STEP_SUCCESS) msg = "Step done. Re-select arm for next step.";
  if (game.state === STATES.TANGLED) msg = "Coordination breakdown!";
  if (game.state === STATES.UNTANGLE) msg = "Mash SPACE to recover!";
  if (game.state === STATES.SERVE_DRINK) {
    msg = game.selectedArm ? "Bring cup to Serve Area" : "Choose tentacle to serve (W/A/S/D)";
  }
  if (game.state === STATES.ORDER_COMPLETE) msg = "Drink served. Next customer incoming.";
  if (!msg) return;

  setShadow(10, 'rgba(0,0,0,0.15)');
  fill(255, 255, 255, 240);
  rect(width * 0.29, 20, width * 0.42, 46, 999);
  clearShadow();

  fill(41, 59, 103); textAlign(CENTER, CENTER); textSize(16); textStyle(BOLD);
  text(msg, width * 0.5, 43); textStyle(NORMAL);
}

function challengeHint() {
  if (!game.challenge) return "";
  const step = currentStep();
  if (game.challenge.type === "timing") return `${labelStep(step)}: press SPACE in green zone`;
  if (game.challenge.type === "hold") return `${labelStep(step)}: hold mouse or SPACE in safe zone`;
  if (game.challenge.type === "rhythm") return "Ice: press SPACE on pulse";
  return `${labelStep(step)}: press SPACE or E twice`;
}

function drawChallengeUi() {
  const c = game.challenge; if (!c) return;

  setShadow(15, 'rgba(0,0,0,0.2)');
  fill(255, 255, 255, 245);
  rect(width * 0.315, height * 0.73, width * 0.37, 105, 20);
  clearShadow();

  if (c.type === "timing") {
    const x = width * 0.34; const y = height * 0.795; const w = width * 0.32;
    fill(224, 232, 250); rect(x, y, w, 16, 999);
    fill(131, 212, 153); rect(x + c.zoneStart * w, y, c.zoneWidth * w, 16, 999);
    fill(53, 77, 137); circle(x + c.cursor * w, y + 8, 16);
  }
  if (c.type === "hold") {
    const x = width * 0.34; const y = height * 0.795; const w = width * 0.32;
    fill(224, 232, 250); rect(x, y, w, 20, 999);
    fill(131, 212, 153); rect(x + w * 0.28, y, w * 0.44, 20, 999);
    fill(53, 77, 137); circle(x + w * c.marker, y + 10, 18);
    fill(72, 88, 132); textAlign(CENTER, CENTER); textSize(13);
    text(`Hold ${c.hold.toFixed(2)} / ${c.needHold.toFixed(2)} s`, width * 0.5, height * 0.845);
  }
  if (c.type === "rhythm") {
    const x = width * 0.34; const y = height * 0.795; const w = width * 0.32;
    const p = constrain(1 - abs(millis() - c.nextBeat) / 700, 0, 1);
    fill(224, 232, 250); rect(x, y, w, 20, 999);
    fill(122, 196, 245); rect(x, y, w * p, 20, 999);
    fill(72, 88, 132); textAlign(CENTER, CENTER); textSize(13);
    text(`Beats ${c.beatsHit}/${c.beatsNeed}   Miss ${c.misses}/2`, width * 0.5, height * 0.845);
  }
  if (c.type === "tap") {
    fill(72, 88, 132); textAlign(CENTER, CENTER); textSize(20); textStyle(BOLD);
    text(`Serve taps ${c.taps}/${c.need}`, width * 0.5, height * 0.81); textStyle(NORMAL);
  }
}

function drawUntangleUi() {
  setShadow(15, 'rgba(0,0,0,0.2)');
  fill(255, 255, 255, 245);
  rect(width * 0.39, height * 0.12, width * 0.22, 64, 20);
  clearShadow();

  fill(66, 81, 124); textAlign(CENTER, CENTER); textSize(15); textStyle(BOLD);
  text("Untangle Progress", width * 0.5, height * 0.145); textStyle(NORMAL);

  fill(226, 232, 249); rect(width * 0.41, height * 0.164, width * 0.18, 14, 999);
  fill(239, 146, 102); rect(width * 0.41, height * 0.164, (width * 0.18 * game.untangleProgress) / 100, 14, 999);
}

function drawParticles() {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 1;
    fill(red(p.col), green(p.col), blue(p.col), map(p.life, 0, p.maxLife, 0, 230));
    circle(p.x, p.y, p.size);
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

function addParticles(x, y, col, count) {
  for (let i = 0; i < count; i++) {
    game.particles.push({ x, y, vx: random(-1.5, 1.5), vy: random(-2, -0.5), size: random(5, 10), life: random(25, 45), maxLife: 45, col });
  }
}

function drawGameOver() {
  fill(15, 23, 45, 220); rect(0, 0, width, height);

  setShadow(40, 'rgba(0,0,0,0.6)');
  fill(255, 255, 255, 248); rect(width * 0.3, height * 0.15, width * 0.4, height * 0.7, 24);
  clearShadow();
  
  fill(235, 242, 255); rect(width * 0.3, height * 0.15, width * 0.4, 90, 24, 24, 0, 0);

  const grade = finalGrade();
  const stampScale = constrain(map(millis() - game.stateStartMs, 0, 400, 3, 1), 1, 3);

  fill(37, 52, 90); textAlign(CENTER, CENTER); textSize(44); textStyle(BOLD);
  text("Shift Complete", width * 0.5, height * 0.21); textStyle(NORMAL);

  push();
  translate(width * 0.5, height * 0.36);
  scale(stampScale);
  if(stampScale === 1) setShadow(15, 'rgba(0,0,0,0.2)');
  fill(grade === 'S' ? color(255, 215, 0) : grade === 'A' ? color(75, 192, 118) : grade === 'B' ? color(87, 153, 222) : color(222, 91, 96));
  ellipse(0, 0, 118, 118);
  fill(255); textSize(56); textStyle(BOLD); text(`${grade}`, 0, 0);
  pop();
  clearShadow();

  fill(37, 52, 90); textSize(20); textStyle(BOLD);
  text(`Orders: ${game.ordersDone}`, width * 0.5, height * 0.50);
  text(`Final Score: ${floor(game.score)}`, width * 0.5, height * 0.55);
  textStyle(NORMAL); textSize(18); fill(90, 110, 150);
  text(`Mistakes: ${game.mistakes}`, width * 0.5, height * 0.60);
  text(`Tangles: ${game.tangles}`, width * 0.5, height * 0.64);
  text(`Best Combo: x${game.bestCombo}`, width * 0.5, height * 0.68);

  const pulse = sin(millis() * 0.005) * 5;
  setShadow(10, 'rgba(87, 153, 222, 0.4)');
  fill(236, 244, 255);
  rect(width * 0.38 - pulse/2, height * 0.74 - pulse/2, width * 0.24 + pulse, 60 + pulse, 999);
  clearShadow();
  
  fill(46, 66, 111); textSize(18); textStyle(BOLD);
  text("Press SPACE to Restart", width * 0.5, height * 0.78); textStyle(NORMAL);
}

function finalGrade() {
  const s = game.score + game.ordersDone * 85 + game.bestCombo * 10 - game.mistakes * 14 - game.tangles * 16;
  if (s > 760) return "S"; if (s > 560) return "A"; if (s > 360) return "B"; return "C";
}

function labelStep(step) {
  if (step === "coffee") return "Coffee"; if (step === "milk") return "Milk"; if (step === "ice") return "Ice";
  if (step === "syrup") return "Syrup"; if (step === "foam") return "Foam"; if (step === "serve") return "Serve"; return "";
}

function drawIngredientIcon(step, x, y, size) {
  push(); translate(x, y); noStroke();
  if (step === "coffee") {
    fill(95, 65, 42); ellipse(0, 2, size * 0.85, size * 0.6);
    fill(245, 232, 204); ellipse(0, 0, size * 0.55, size * 0.33);
    stroke(90, 70, 54); strokeWeight(2); noFill();
    arc(size * 0.43, 2, size * 0.35, size * 0.3, -HALF_PI, HALF_PI); noStroke();
  } else if (step === "milk") {
    fill(233, 246, 255); rect(-size * 0.22, -size * 0.26, size * 0.44, size * 0.56, 6);
    fill(176, 214, 241); quad(-size * 0.22, -size * 0.26, size * 0.22, -size * 0.26, size * 0.14, -size * 0.45, -size * 0.14, -size * 0.45);
  } else if (step === "ice") {
    fill(171, 229, 255); rect(-size * 0.25, -size * 0.25, size * 0.25, size * 0.25, 4);
    rect(-size * 0.02, -size * 0.12, size * 0.25, size * 0.25, 4); rect(-size * 0.18, size * 0.07, size * 0.25, size * 0.25, 4);
  } else if (step === "syrup") {
    fill(228, 162, 96); rect(-size * 0.18, -size * 0.2, size * 0.36, size * 0.5, 7);
    fill(255, 207, 142); rect(-size * 0.11, -size * 0.34, size * 0.22, size * 0.12, 3);
    fill(188, 93, 54); ellipse(0, size * 0.03, size * 0.16, size * 0.3);
  } else if (step === "foam") {
    fill(238, 248, 255); ellipse(0, -size * 0.05, size * 0.6, size * 0.35);
    ellipse(-size * 0.16, size * 0.02, size * 0.35, size * 0.25); ellipse(size * 0.16, size * 0.03, size * 0.35, size * 0.25);
    fill(147, 182, 225); rect(-size * 0.24, size * 0.05, size * 0.48, size * 0.24, 5);
  } else if (step === "serve") {
    fill(239, 248, 255); rect(-size * 0.24, -size * 0.25, size * 0.48, size * 0.6, 6);
    fill(127, 166, 211); rect(-size * 0.13, -size * 0.15, size * 0.26, size * 0.04, 3);
    rect(-size * 0.13, -size * 0.03, size * 0.26, size * 0.04, 3); rect(-size * 0.13, size * 0.09, size * 0.26, size * 0.04, 3);
  } else {
    fill(90, 110, 160); circle(0, 0, size * 0.3);
  }
  pop();
}
