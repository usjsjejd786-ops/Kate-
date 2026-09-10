(function () {
"use strict";

/* =====================================================
   ASSETS
===================================================== */
const ASSETS = [
  "assets/img01.webp", // rostos triplicados
  "assets/img02.webp", // olho
  "assets/img03.jpg",  // rosto spray
  "assets/img04.jpg",  // rosto pixelizado
  "assets/img05.jpg",  // rosto contornado
  "assets/img06.jpg",  // boca pixelizada
  "assets/img07.jpg",  // crânio/cérebro com gancho
  "assets/img08.jpg",  // máscaras grão (triste/feliz)
  "assets/img09.webp", // rosto vazio com reflexo
  "assets/img10.webp", // rostos multiplicados/borrados
  "assets/img11.jpg",  // máscara tripla
  "assets/img12.jpg",  // raio-x tórax/coração
  "assets/img13.webp", // rosto duplicado em grade
  "assets/img14.webp", // rosto boca aberta dentes
  "assets/img15.webp", // ressonância crânio
  "assets/img16.webp", // rosto borrado gritando
  "assets/img17.jpg"   // rosto com máscaras ao fundo
];
const EYE_INDEX = 1;
const MOUTH_INDEX = 5;
const FACE_INDEXES = [0, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const stage = document.getElementById("stage");
const tearLayer = document.getElementById("tearing-layer");
const flickerEl = document.querySelector(".flicker");
const aberrationEl = document.querySelector(".aberration");
const whisperEl = document.getElementById("whisper-text");

const WHISPERS = [
  "EU SEI O QUE VC FEZ",
  "EU TE VEJO",
  "CUIDADO",
  "VOCÊ QUE FEZ ISSO"
];

// snaps a phrase on screen for a very short, fixed instant — no fade in
// or out — so it reads as a single "corrupted frame" that's gone before
// you can really process it
function flashWhisper(text = pick(WHISPERS), duration = rand(70, 150)) {
  whisperEl.textContent = text;
  whisperEl.style.transition = "none";
  whisperEl.style.opacity = "1";
  setTimeout(() => { whisperEl.style.opacity = "0"; }, duration);
}

let sessionStart = performance.now();
function elapsed() { return (performance.now() - sessionStart) / 1000; }

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* =====================================================
   BACKGROUND NOISE (canvas static, low-cost)
===================================================== */
const BackgroundNoise = (function () {
  const canvas = document.getElementById("noise-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  let w, h, imgData, buf32;
  let running = true;
  let intensity = 0.14;

  function resize() {
    w = canvas.width = Math.floor(window.innerWidth / 2);
    h = canvas.height = Math.floor(window.innerHeight / 2);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    imgData = ctx.createImageData(w, h);
    buf32 = new Uint32Array(imgData.data.buffer);
  }
  window.addEventListener("resize", resize);
  resize();

  function frame() {
    if (running) {
      const alpha = Math.floor(intensity * 255) << 24;
      for (let i = 0; i < buf32.length; i++) {
        const v = (Math.random() * 255) | 0;
        buf32[i] = alpha | (v << 16) | (v << 8) | v;
      }
      ctx.putImageData(imgData, 0, 0);
    }
    setTimeout(() => requestAnimationFrame(frame), 90); // throttled, cheap
  }
  requestAnimationFrame(frame);

  return {
    setIntensity(v) { intensity = clamp(v, 0, 0.95); },
    burst(v, ms) {
      const prev = intensity;
      intensity = v;
      setTimeout(() => (intensity = prev), ms);
    }
  };
})();

/* =====================================================
   AUDIO MANAGER (synthesized — no external audio files)
===================================================== */
const AudioManager = (function () {
  let ctx = null;
  let enabled = false;
  let hum = null;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function whiteNoiseBurst(duration = 0.12, gainVal = 0.05) {
    if (!enabled) return;
    ensureCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = gainVal;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  function click(freq = 800, duration = 0.03, gainVal = 0.04) {
    if (!enabled) return;
    ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq * (0.7 + Math.random() * 0.6);
    gain.gain.value = gainVal;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function startHum() {
    if (!enabled || hum) return;
    ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 50;
    gain.gain.value = 0.008;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    hum = { osc, gain };
  }
  function stopHum() {
    if (hum) {
      try { hum.osc.stop(); } catch (e) {}
      hum = null;
    }
  }

  // --- real audio files (uploaded SFX), separate from the synthesized stuff above ---
  const tvStaticLoop = new Audio("assets/audio/tv-static.mp3");
  tvStaticLoop.loop = true;
  tvStaticLoop.volume = 0.14;

  // small pool so overlapping plays don't cut each other off, but a cap
  // keeps things from turning into a wall of noise if images spawn fast
  const manglePool = [0, 1, 2].map(() => {
    const a = new Audio("assets/audio/mangle-static.mp3");
    a.volume = 0.4;
    return a;
  });
  function playMangleStatic() {
    if (!enabled) return;
    const free = manglePool.find((a) => a.paused || a.ended);
    if (!free) return; // all instances busy — just skip this one
    free.currentTime = 0;
    free.play().catch(() => {});
  }

  // sound turns itself on at the first tap/click anywhere on the page —
  // no visible button needed, this just satisfies the browser's autoplay
  // rule that audio needs a user gesture first
  function enableOnFirstInteraction() {
    if (enabled) return;
    enabled = true;
    ensureCtx();
    startHum();
    tvStaticLoop.play().catch(() => {});
  }
  window.addEventListener("pointerdown", enableOnFirstInteraction, { once: true });
  window.addEventListener("keydown", enableOnFirstInteraction, { once: true });

  return { whiteNoiseBurst, click, playMangleStatic, isEnabled: () => enabled };
})();

/* =====================================================
   DISTORTION SYSTEM (screen-wide effects)
===================================================== */
const DistortionSystem = (function () {

  function shakeStage(strength = 8, duration = 180) {
    const start = performance.now();
    function step() {
      const t = performance.now() - start;
      if (t > duration) { stage.style.transform = ""; return; }
      const x = rand(-strength, strength);
      const y = rand(-strength, strength);
      stage.style.transform = `translate(${x}px,${y}px)`;
      requestAnimationFrame(step);
    }
    step();
  }

  function whiteFlicker(duration = 90, peak = 0.5) {
    flickerEl.style.transition = "none";
    flickerEl.style.opacity = String(peak);
    requestAnimationFrame(() => {
      flickerEl.style.transition = `opacity ${duration}ms linear`;
      flickerEl.style.opacity = "0";
    });
  }

  function aberrationPulse(duration = 250, peak = 0.9) {
    aberrationEl.style.transition = "none";
    aberrationEl.style.opacity = String(peak);
    requestAnimationFrame(() => {
      aberrationEl.style.transition = `opacity ${duration}ms ease-out`;
      aberrationEl.style.opacity = "0";
    });
  }

  function horizontalTear(count = randInt(2, 5)) {
    const frag = document.createDocumentFragment();
    const strips = [];
    for (let i = 0; i < count; i++) {
      const strip = document.createElement("div");
      strip.className = "tear-strip";
      const hPct = rand(4, 18);
      const top = rand(0, 100 - hPct);
      strip.style.top = top + "vh";
      strip.style.height = hPct + "vh";
      const offset = rand(-140, 140);
      strip.style.transform = `translateX(${offset}px)`;
      const img = document.createElement("img");
      img.src = pick(ASSETS);
      img.style.top = -(top) + "vh";
      img.style.height = "100vh";
      strip.appendChild(img);
      frag.appendChild(strip);
      strips.push(strip);
    }
    tearLayer.appendChild(frag);
    setTimeout(() => strips.forEach((s) => s.remove()), rand(80, 260));
  }

  function fullScreenFlash(index = pick(ASSETS.map((_, i) => i))) {
    const img = document.createElement("img");
    img.className = "fullflash";
    img.src = ASSETS[index];
    document.body.appendChild(img);
    requestAnimationFrame(() => {
      img.style.transition = "opacity 40ms linear";
      img.style.opacity = "1";
      setTimeout(() => {
        img.style.transition = "opacity 90ms linear";
        img.style.opacity = "0";
        setTimeout(() => img.remove(), 120);
      }, rand(60, 160));
    });
  }

  function blackoutAll(duration = 900) {
    const veil = document.createElement("div");
    veil.className = "blackveil";
    veil.style.transition = "opacity 260ms ease-in";
    document.body.appendChild(veil);
    requestAnimationFrame(() => (veil.style.opacity = "1"));

    // while the screen is fully black, there's a good chance of a single
    // subliminal phrase snapping on for an instant — easy to miss if you blink
    if (chance(0.65) && duration > 400) {
      setTimeout(() => flashWhisper(), rand(280, Math.max(300, duration - 200)));
    }

    setTimeout(() => {
      veil.style.transition = "opacity 500ms ease-out";
      veil.style.opacity = "0";
      setTimeout(() => veil.remove(), 520);
    }, duration);
  }

  // classic VHS tracking-error: a noisy band rolls across the screen while
  // the whole stage jitters/rolls vertically for a moment
  function vhsTrackingGlitch(duration = rand(350, 750)) {
    const band = document.createElement("div");
    band.className = "vhs-track-band";
    band.style.setProperty("--vhs-dur", duration + "ms");
    document.body.appendChild(band);

    stage.classList.add("vhs-roll");
    stage.style.setProperty("--vhs-roll-dur", duration + "ms");

    setTimeout(() => {
      band.remove();
      stage.classList.remove("vhs-roll");
      stage.style.removeProperty("--vhs-roll-dur");
    }, duration);
  }

  return { shakeStage, whiteFlicker, aberrationPulse, horizontalTear, fullScreenFlash, blackoutAll, vhsTrackingGlitch };
})();

/* =====================================================
   GLITCH ENGINE (per-node corruption)
===================================================== */
const GlitchEngine = (function () {

  function pulseClass(node, cls, duration) {
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), duration);
  }

  function rgbSplit(node, duration = rand(120, 380)) {
    pulseClass(node, "rgbsplit", duration);
  }
  function negative(node, duration = rand(80, 220)) {
    pulseClass(node, "negative", duration);
  }
  function bw(node, duration = rand(150, 400)) {
    pulseClass(node, "bw", duration);
  }
  function blur(node, duration = rand(120, 300)) {
    pulseClass(node, "blur", duration);
  }
  function hueShift(node, duration = rand(150, 350)) {
    pulseClass(node, "hue", duration);
  }
  function invisibleBlip(node, duration = rand(60, 160)) {
    pulseClass(node, "blackout", duration);
  }

  function skewJolt(node, duration = 150) {
    const prev = node.style.transform;
    const skx = rand(-14, 14);
    const rot = rand(-6, 6);
    const scl = rand(0.94, 1.08);
    node.style.transform = prev + ` skew(${skx}deg) rotate(${rot}deg) scale(${scl})`;
    setTimeout(() => (node.style.transform = prev), duration);
  }

  function mirrorBlip(node, duration = 180) {
    const prev = node.style.transform;
    node.style.transform = prev + " scaleX(-1)";
    setTimeout(() => (node.style.transform = prev), duration);
  }

  function fragmentDisplace(node, duration = rand(140, 320)) {
    const frags = node.querySelectorAll(".frag");
    if (!frags.length) return;
    frags.forEach((f) => {
      if (chance(0.6)) {
        const dx = rand(-160, 160);
        f.style.transition = "none";
        f.style.transform = `translateX(${dx}px)`;
      }
    });
    setTimeout(() => {
      frags.forEach((f) => {
        f.style.transition = "transform 90ms ease-out";
        f.style.transform = "translateX(0)";
      });
    }, duration);
  }

  // pixelation via offscreen canvas downscale/upscale
  function pixelate(node, duration = rand(300, 700)) {
    const img = node.querySelector("img");
    const canvas = node.querySelector("canvas.pixcanvas");
    if (!img || !canvas || !img.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    const rect = node.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    canvas.width = w;
    canvas.height = h;

    let step = 0;
    const stages = [22, 10, 5, 2, 6, 14];
    node.classList.add("pixmode");

    function drawStage() {
      const blockSize = stages[step];
      const sw = Math.max(1, Math.floor(w / blockSize));
      const sh = Math.max(1, Math.floor(h / blockSize));
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, sw, sh);
      ctx.drawImage(canvas, 0, 0, sw, sh, 0, 0, w, h);
      step++;
      if (step < stages.length) {
        setTimeout(drawStage, duration / stages.length);
      } else {
        setTimeout(() => node.classList.remove("pixmode"), 40);
      }
    }
    drawStage();
  }

  function duplicateGhost(node) {
    const clone = node.cloneNode(true);
    clone.classList.add("visible");
    clone.style.opacity = "0.55";
    clone.style.mixBlendMode = "screen";
    const dx = rand(-40, 40);
    const dy = rand(-30, 30);
    const baseTransform = node.style.transform || "";
    clone.style.transform = baseTransform + ` translate(${dx}px,${dy}px)`;
    clone.style.zIndex = String((parseInt(node.style.zIndex) || 1) - 1);
    stage.appendChild(clone);
    setTimeout(() => clone.remove(), rand(120, 320));
  }

  function combo(node) {
    const actions = [rgbSplit, negative, bw, blur, hueShift, skewJolt, fragmentDisplace, pixelate];
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) pick(actions)(node);
    if (chance(0.3)) duplicateGhost(node);
  }

  // heavy VHS-style corruption on a single image: exaggerated colour-channel
  // split + a horizontal tracking-tear band + a brief vertical jolt
  function vhsChroma(node, duration = rand(220, 480)) {
    pulseClass(node, "vhs", duration);
    const band = document.createElement("div");
    band.className = "vhs-tear";
    band.style.top = rand(10, 85) + "%";
    band.style.height = rand(4, 14) + "%";
    node.appendChild(band);
    setTimeout(() => band.remove(), duration);

    const prev = node.style.transform;
    node.style.transform = prev + ` translateY(${rand(-6, 6)}px) skewX(${rand(-3, 3)}deg)`;
    setTimeout(() => (node.style.transform = prev), duration);
  }

  return {
    rgbSplit, negative, bw, blur, hueShift, invisibleBlip,
    skewJolt, mirrorBlip, fragmentDisplace, pixelate, duplicateGhost, combo, vhsChroma
  };
})();

/* =====================================================
   IMAGE MANAGER
===================================================== */
// position/size are fully random across the whole screen now — any spot,
// any size (small close-ups to huge oversized ones), nothing stays centered
function centeredLeft(size) {
  return rand(-size * 0.4, 100 - size * 0.6);
}
function centeredTop(size) {
  return rand(-size * 0.3, 90 - size * 0.5);
}

const ImageManager = (function () {
  const activeNodes = new Set();
  const MAX_NODES = window.innerWidth < 700 ? 3 : 5;

  function buildNode(assetIndex, opts = {}) {
    const node = document.createElement("div");
    node.className = "node";
    node.dataset.asset = assetIndex;

    const useFrags = opts.fragmented && chance(0.5);
    if (useFrags) {
      for (let i = 1; i <= 3; i++) {
        const frag = document.createElement("div");
        frag.className = "frag f" + i;
        const img = document.createElement("img");
        img.src = ASSETS[assetIndex];
        img.draggable = false;
        frag.appendChild(img);
        node.appendChild(frag);
      }
    } else {
      const img = document.createElement("img");
      img.src = ASSETS[assetIndex];
      img.draggable = false;
      node.appendChild(img);

      const canvas = document.createElement("canvas");
      canvas.className = "pixcanvas";
      node.appendChild(canvas);

      // rgb split ghost layers
      const layerR = document.createElement("div");
      layerR.className = "layer r";
      const layerB = document.createElement("div");
      layerB.className = "layer b";
      node.appendChild(layerR);
      node.appendChild(layerB);
    }

    const size = opts.size || rand(8, 78); // vw — anywhere from a tiny close-up to a huge oversized one
    const left = opts.left != null ? opts.left : centeredLeft(size);
    const top = opts.top != null ? opts.top : centeredTop(size);
    const rot = opts.rot != null ? opts.rot : rand(-9, 9);
    const z = opts.z || randInt(1, 20);

    node.style.width = size + "vw";
    node.style.left = left + "vw";
    node.style.top = top + "vh";
    node.style.zIndex = z;
    node.style.transform = `rotate(${rot}deg)`;

    node._baseTransform = node.style.transform;
    node._driftPhase = rand(0, Math.PI * 2);
    node._driftSpeed = rand(0.15, 0.5);
    node._still = chance(0.35); // some stay perfectly still

    stage.appendChild(node);
    requestAnimationFrame(() => node.classList.add("visible"));
    activeNodes.add(node);

    if (chance(0.25)) AudioManager.playMangleStatic();

    return node;
  }

  function removeNode(node) {
    if (!activeNodes.has(node)) return;
    node.classList.remove("visible");
    activeNodes.delete(node);
    setTimeout(() => node.remove(), 400);
  }

  function pruneIfNeeded() {
    if (activeNodes.size <= MAX_NODES) return;
    const arr = Array.from(activeNodes);
    const toRemove = arr.slice(0, arr.length - MAX_NODES);
    toRemove.forEach(removeNode);
  }

  function activeAssetIndexes() {
    const used = new Set();
    activeNodes.forEach((n) => used.add(Number(n.dataset.asset)));
    return used;
  }

  // pick a random asset index that isn't already visible on screen, when possible
  function pickFreshAssetIndex(pool) {
    const used = activeAssetIndexes();
    const free = pool.filter((i) => !used.has(i));
    return free.length ? pick(free) : pick(pool); // if everything is in use, fall back to any
  }

  function spawnRandom(opts = {}) {
    pruneIfNeeded();
    const idx = opts.assetIndex != null
      ? opts.assetIndex
      : pickFreshAssetIndex(ASSETS.map((_, i) => i));
    const node = buildNode(idx, opts);

    // EVERY image gets a random lifespan by default — nothing is allowed to
    // stay on screen forever. Pass life:null explicitly to opt out (unused).
    if (opts.life !== null) {
      const life = opts.life != null ? opts.life : rand(1400, 4200);
      setTimeout(() => removeNode(node), life);
    }
    return node;
  }

  function spawnBrief(opts = {}, life = rand(300, 900)) {
    const node = spawnRandom({ ...opts, fragmented: false, life });
    return node;
  }

  function eachActive(fn) { activeNodes.forEach(fn); }
  function randomActive() {
    const arr = Array.from(activeNodes);
    return arr.length ? pick(arr) : null;
  }
  function count() { return activeNodes.size; }

  // subtle continuous drift/breathing for non-still nodes
  function driftLoop() {
    activeNodes.forEach((node) => {
      if (node._still) return;
      node._driftPhase += node._driftSpeed * 0.02;
      const dx = Math.sin(node._driftPhase) * 3;
      const dy = Math.cos(node._driftPhase * 0.8) * 3;
      const scale = 1 + Math.sin(node._driftPhase * 0.5) * 0.01;
      node.style.transform = `${node._baseTransform} translate(${dx}px,${dy}px) scale(${scale})`;
    });
    requestAnimationFrame(driftLoop);
  }
  requestAnimationFrame(driftLoop);

  return { spawnRandom, spawnBrief, removeNode, eachActive, randomActive, count, MAX_NODES, freshAssetFrom: pickFreshAssetIndex };
})();

/* =====================================================
   INTRO SEQUENCE — "acordando"
===================================================== */
function introSequence() {
  BackgroundNoise.setIntensity(0.14);
  let i = 0;
  const flashes = randInt(4, 6);

  function step() {
    if (i >= flashes) {
      setTimeout(buildChaoticGallery, rand(400, 900));
      return;
    }
    i++;
    const size = rand(16, 30);
    const node = ImageManager.spawnBrief(
      { size, left: centeredLeft(size), top: centeredTop(size), rot: rand(-5, 5), z: 5 },
      rand(90, 260)
    );
    if (chance(0.4)) setTimeout(() => GlitchEngine.rgbSplit(node, 150), 30);
    const wait = rand(700, 1800);
    setTimeout(step, wait);
  }
  setTimeout(step, rand(900, 1600));
}

function buildChaoticGallery() {
  const initial = window.innerWidth < 700 ? 1 : 2;
  for (let i = 0; i < initial; i++) {
    setTimeout(() => {
      ImageManager.spawnRandom({ fragmented: chance(0.3) });
    }, i * rand(300, 600));
  }
  startRandomEvents();
}

/* =====================================================
   RANDOM EVENTS SYSTEM
===================================================== */
const RandomEvents = (function () {
  const events = [
    { name: "flashBrief", weight: 1.5, calm: true, fn: () => {
      const size = rand(15, 38);
      const n = ImageManager.spawnBrief({ size, left: centeredLeft(size), top: centeredTop(size) }, rand(80, 180));
      AudioManager.click(1200, 0.02, 0.03);
    }},
    { name: "fullFrame", weight: 1.5, fn: () => {
      DistortionSystem.fullScreenFlash();
      AudioManager.whiteNoiseBurst(0.1, 0.05);
    }},
    { name: "duplicate", weight: 2, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.duplicateGhost(n);
    }},
    { name: "mirror", weight: 2, calm: true, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.mirrorBlip(n, rand(150, 350));
    }},
    { name: "glitchNode", weight: 4, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.combo(n);
    }},
    { name: "eyeBlip", weight: 1.2, calm: true, fn: () => {
      const size = rand(8, 18);
      const n = ImageManager.spawnBrief(
        { assetIndex: EYE_INDEX, size, left: centeredLeft(size), top: centeredTop(size), z: 30 },
        rand(60, 180)
      );
    }},
    { name: "mouthBig", weight: 0.7, fn: () => {
      const size = rand(45, 75); // still big/close, but no longer overruns the whole frame
      const n = ImageManager.spawnBrief(
        { assetIndex: MOUTH_INDEX, size, left: centeredLeft(size), top: centeredTop(size), z: 25 },
        rand(150, 320)
      );
      AudioManager.click(200, 0.05, 0.03);
    }},
    { name: "faceBehind", weight: 0.9, calm: true, fn: () => {
      const size = rand(24, 42);
      const behind = ImageManager.spawnBrief(
        { assetIndex: ImageManager.freshAssetFrom(FACE_INDEXES), size, left: centeredLeft(size), top: centeredTop(size), z: 2 },
        rand(200, 450)
      );
    }},
    { name: "negativeNode", weight: 2, calm: true, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.negative(n, rand(90, 220));
    }},
    { name: "bwAll", weight: 0.6, fn: () => {
      ImageManager.eachActive((n) => GlitchEngine.bw(n, rand(200, 450)));
    }},
    { name: "screenTear", weight: 2.2, fn: () => {
      DistortionSystem.horizontalTear();
      DistortionSystem.shakeStage(6, 120);
      AudioManager.whiteNoiseBurst(0.08, 0.04);
    }},
    { name: "aberration", weight: 2, fn: () => {
      DistortionSystem.aberrationPulse();
    }},
    { name: "flicker", weight: 2, fn: () => {
      DistortionSystem.whiteFlicker(rand(60,140), rand(0.2,0.5));
    }},
    { name: "vanishAll", weight: 0.4, fn: () => {
      const nodes = [];
      ImageManager.eachActive((n) => nodes.push(n));
      nodes.forEach((n) => (n.style.opacity = "0"));
      setTimeout(() => nodes.forEach((n) => n.classList.contains("visible") && (n.style.opacity = "1")), rand(600, 1400));
    }},
    { name: "blackout", weight: 0.4, fn: () => {
      DistortionSystem.blackoutAll(rand(500, 1100));
    }},
    { name: "multiply", weight: 0.3, fn: () => {
      // only ever adds ONE extra image, and only if we're below the (now low) cap
      if (ImageManager.count() < ImageManager.MAX_NODES) {
        ImageManager.spawnRandom({});
      }
    }},
    { name: "pixelCorrupt", weight: 2.2, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.pixelate(n, rand(300, 600));
    }},
    { name: "fullFrameGlitch", weight: 1.5, fn: () => {
      // pure screen-wide glitch burst, no new image spawned
      DistortionSystem.aberrationPulse(rand(150, 300), rand(0.5, 0.9));
      DistortionSystem.whiteFlicker(rand(50, 110), rand(0.15, 0.4));
      if (chance(0.5)) DistortionSystem.shakeStage(rand(3, 9), rand(80, 160));
      AudioManager.whiteNoiseBurst(0.06, 0.03);
    }},
    { name: "vhsTracking", weight: 2.2, fn: () => {
      // the tracking-error band that rolls across the whole screen
      DistortionSystem.vhsTrackingGlitch();
      AudioManager.whiteNoiseBurst(0.1, 0.04);
    }},
    { name: "vhsNodeCorrupt", weight: 2, fn: () => {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.vhsChroma(n, rand(250, 500));
    }},
    { name: "staticBurst", weight: 2.5, fn: () => {
      // heavy channel-search-style static slam, then settles back down
      BackgroundNoise.burst(rand(0.6, 0.9), rand(180, 420));
      DistortionSystem.whiteFlicker(rand(40, 90), rand(0.1, 0.3));
      AudioManager.whiteNoiseBurst(0.15, 0.06);
    }}
  ];

  const totalWeight = events.reduce((s, e) => s + e.weight, 0);
  const calmEvents = events.filter((e) => e.calm);
  const calmWeight = calmEvents.reduce((s, e) => s + e.weight, 0);

  function pickEvent(calmOnly) {
    const pool = calmOnly ? calmEvents : events;
    const total = calmOnly ? calmWeight : totalWeight;
    let r = Math.random() * total;
    for (const e of pool) {
      if (r < e.weight) return e;
      r -= e.weight;
    }
    return pool[0];
  }

  let running = false;
  let intensityFactor = 1;

  // first ~13s: almost nothing, long gaps, only mild effects — lets the
  // person get comfortable. After that: fast ramp into full chaos, which
  // reads as much scarier than staying at one constant chaos level.
  const CALM_DURATION = 13;   // seconds of near-silence at the start
  const RAMP_DURATION = 9;    // seconds to go from calm to full chaos

  function loop() {
    if (!running) return;
    const t = elapsed();
    const inCalmPhase = t < CALM_DURATION;
    const ev = pickEvent(inCalmPhase);
    try { ev.fn(); } catch (err) { /* fail silently, never expose errors visually */ }

    let next;
    if (inCalmPhase) {
      intensityFactor = 0.3;
      BackgroundNoise.setIntensity(0.15); // quiet but still a visible layer of TV snow
      next = rand(2600, 4800); // long, quiet gaps
    } else {
      const progression = clamp((t - CALM_DURATION) / RAMP_DURATION, 0, 1);
      intensityFactor = 1.2 + progression * 2.8; // ramps past the old max — more contrast
      BackgroundNoise.setIntensity(0.2 + progression * 0.4); // heavy TV static once it ramps up
      const base = rand(450, 1500);
      next = base / intensityFactor;
    }
    setTimeout(loop, next);
  }

  function start() {
    if (running) return;
    running = true;
    setTimeout(loop, rand(1200, 2200)); // first event also waits a bit
  }
  function boostBriefly(factor = 3, duration = 1500) {
    const prev = intensityFactor;
    intensityFactor = prev * factor;
    setTimeout(() => (intensityFactor = prev), duration);
  }

  return { start, boostBriefly };
})();

function startRandomEvents() { RandomEvents.start(); }

/* =====================================================
   INTERACTION MANAGER (mouse / touch)
===================================================== */
const InteractionManager = (function () {
  let lastX = window.innerWidth / 2, lastY = window.innerHeight / 2;
  let lastT = performance.now();
  let idleTimer = null;
  let stareTarget = null;
  let stareStage = 0;

  function onMove(x, y) {
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    const dist = Math.hypot(x - lastX, y - lastY);
    const speed = dist / dt; // px/ms

    // subtle parallax on a couple nodes
    const dxN = (x / window.innerWidth - 0.5) * 10;
    const dyN = (y / window.innerHeight - 0.5) * 10;
    let i = 0;
    ImageManager.eachActive((node) => {
      if (i % 3 === 0 && !node._still) {
        node.style.marginLeft = dxN * 0.4 + "px";
        node.style.marginTop = dyN * 0.4 + "px";
      }
      i++;
    });

    if (speed > 1.1 && chance(clamp(speed * 0.25, 0, 0.5))) {
      const n = ImageManager.randomActive();
      if (n) GlitchEngine.skewJolt(n, 100);
    }

    lastX = x; lastY = y; lastT = now;

    resetIdle(x, y);
  }

  function resetIdle(x, y) {
    clearTimeout(idleTimer);
    stareStage = 0;
    idleTimer = setTimeout(() => tryStare(x, y), 2200);
  }

  function tryStare(x, y) {
    const el = document.elementFromPoint(x, y);
    const node = el ? el.closest(".node") : null;
    if (!node) return;
    stareTarget = node;
    stareStage = 1;
    stareTick();
  }

  function stareTick() {
    if (!stareTarget) return;
    if (stareStage === 1) {
      setTimeout(() => {
        if (stareStage !== 1) return;
        GlitchEngine.rgbSplit(stareTarget, 200);
        stareStage = 2;
        stareTick();
      }, rand(1200, 2200));
    } else if (stareStage === 2) {
      setTimeout(() => {
        if (stareStage !== 2) return;
        GlitchEngine.pixelate(stareTarget, 400);
        stareStage = 3;
      }, rand(900, 1800));
    }
  }

  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY), { passive: true });

  let touchCount = 0;
  window.addEventListener("touchstart", (e) => {
    touchCount++;
    const t = e.touches[0];
    if (!t) return; // guard: some touch events fire with no active touch point
    onMove(t.clientX, t.clientY);
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const node = el ? el.closest(".node") : null;
    if (node) GlitchEngine.combo(node);
    if (touchCount > 6) {
      RandomEvents.boostBriefly(2.5, 1200);
      touchCount = 0;
    }
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (t) onMove(t.clientX, t.clientY);
  }, { passive: true });

  /* click-based secret: clicking same node repeatedly */
  let clickTarget = null;
  let clickCount = 0;
  window.addEventListener("click", (e) => {
    const node = e.target.closest(".node");
    if (!node) return;
    if (node === clickTarget) clickCount++;
    else { clickTarget = node; clickCount = 1; }

    // clicking doesn't always do the same thing: sometimes full disfigurement,
    // sometimes just a small hiccup, sometimes nothing visible happens at all
    const r = Math.random();
    if (r < 0.4) {
      GlitchEngine.combo(node);          // heavy: disfigured/corrupted
      GlitchEngine.vhsChroma(node, rand(200, 450));
    } else if (r < 0.75) {
      pick([GlitchEngine.rgbSplit, GlitchEngine.skewJolt, GlitchEngine.negative])(node); // light hiccup
    } // else: nothing — click just registers, image stays normal

    AudioManager.click(400 + clickCount * 80, 0.03, 0.03);

    if (clickCount >= 5) {
      // extreme corruption secret event
      for (let i = 0; i < 4; i++) GlitchEngine.combo(node);
      DistortionSystem.aberrationPulse(400, 1);
      DistortionSystem.shakeStage(14, 260);
      GlitchEngine.pixelate(node, 700);
      clickCount = 0;
    }
  });

  return {};
})();

/* =====================================================
   SECRET EVENTS (scroll-return, key sequence)
===================================================== */
const SecretEvents = (function () {
  let hasScrolledDown = false;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y > window.innerHeight * 1.2) hasScrolledDown = true;
    if (hasScrolledDown && y < 10) {
      hasScrolledDown = false;
      DistortionSystem.blackoutAll(700);
      setTimeout(() => {
        for (let i = 0; i < 3; i++) ImageManager.spawnBrief({ size: rand(40, 90) }, rand(200, 400));
      }, 750);
    }

    // some nodes react as they leave/enter viewport
    ImageManager.eachActive((node) => {
      const r = node.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight;
      if (!visible && chance(0.02)) GlitchEngine.negative(node, 150);
    });
  }, { passive: true });

  // hidden key sequence: arrow keys forming a small pattern
  const sequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"];
  let buffer = [];
  window.addEventListener("keydown", (e) => {
    buffer.push(e.key);
    buffer = buffer.slice(-sequence.length);
    if (buffer.join(",") === sequence.join(",")) {
      buffer = [];
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          ImageManager.eachActive((n) => GlitchEngine.combo(n));
          DistortionSystem.horizontalTear(6);
        }, i * 90);
      }
      RandomEvents.boostBriefly(4, 2500);
    }
  });

  return {};
})();

/* =====================================================
   INIT
===================================================== */
document.addEventListener("DOMContentLoaded", () => {
  try {
    introSequence();
  } catch (err) {
    // if the intro sequence fails for any reason, don't let the whole
    // page stay blank — jump straight to showing images
    try { buildChaoticGallery(); } catch (err2) {}
  }
});

})();
