/* ===========================================================
   FRUIT DOJO — jeu de type Fruit Ninja en Canvas 2D
   =========================================================== */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const lifeIcons = document.querySelectorAll(".life");
const startScreen = document.getElementById("start-screen");
const gameoverScreen = document.getElementById("gameover-screen");
const startBtn = document.getElementById("start-btn");
const retryBtn = document.getElementById("retry-btn");
const finalScoreEl = document.getElementById("final-score");
const bestScoreLine = document.getElementById("best-score-line");

let W, H, DPR;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);

/* ---------- Types de fruits ---------- */
const FRUIT_TYPES = [
  { name: "pasteque", radius: 46, color: "#3aa17e", fleshColor: "#ff6f81", accent: "#e8f5ee", points: 10 },
  { name: "orange", radius: 32, color: "#f2924b", fleshColor: "#ffcf6b", accent: "#fff2df", points: 12 },
  { name: "citron", radius: 28, color: "#e8d33f", fleshColor: "#f6f0a8", accent: "#fbf7d8", points: 14 },
  { name: "raisin", radius: 24, color: "#7c5cbf", fleshColor: "#c9b6ec", accent: "#efe6fb", points: 16 },
  { name: "fraise", radius: 26, color: "#e0483e", fleshColor: "#ff8f8f", accent: "#ffe1e1", points: 15 },
];

const GRAVITY = 1500; // px/s^2

/* ---------- Etat du jeu ---------- */
let fruits = [];
let particles = [];
let trail = [];
let score = 0;
let combo = 0;
let comboTimer = 0;
let lives = 3;
let running = false;
let lastTime = 0;
let spawnTimer = 0;
let spawnInterval = 1.1;
let elapsed = 0;
let shakeTime = 0;

const BEST_KEY = "fruitDojoBestScore";

/* ---------- Entrée (souris / tactile) ---------- */
let pointerActive = false;
let pointerPos = { x: 0, y: 0 };

function getPointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const p = evt.touches ? evt.touches[0] : evt;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}

function pointerDown(evt) {
  pointerActive = true;
  pointerPos = getPointerPos(evt);
  trail.push({ x: pointerPos.x, y: pointerPos.y, t: performance.now() });
}
function pointerMove(evt) {
  if (!running) return;
  evt.preventDefault();
  const prev = pointerPos;
  pointerPos = getPointerPos(evt);
  trail.push({ x: pointerPos.x, y: pointerPos.y, t: performance.now() });
  if (trail.length > 14) trail.shift();
  if (pointerActive) {
    checkSliceAlongSegment(prev, pointerPos);
  }
}
function pointerUp() {
  pointerActive = false;
}

canvas.addEventListener("mousedown", pointerDown);
canvas.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);

canvas.addEventListener("touchstart", (e) => { pointerDown(e); }, { passive: true });
canvas.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp);

/* ---------- Fruit ---------- */
class Fruit {
  constructor() {
    const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
    Object.assign(this, type);
    this.isBomb = false;
    this.x = 60 + Math.random() * (W - 120);
    this.y = H + this.radius + 10;
    const targetHeightFactor = 0.35 + Math.random() * 0.35;
    const vy = -Math.sqrt(2 * GRAVITY * H * (0.55 + targetHeightFactor));
    this.vx = (Math.random() - 0.5) * 220;
    this.vy = vy;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 3;
    this.sliced = false;
    this.dead = false;
  }
  update(dt) {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;
    if (this.y - this.radius > H + 40) this.dead = true;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    // shadow glow
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18;
    ctx.fill();
    // inner highlight
    ctx.beginPath();
    ctx.arc(-this.radius * 0.28, -this.radius * 0.28, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = this.accent;
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

class Bomb {
  constructor() {
    this.isBomb = true;
    this.radius = 34;
    this.x = 60 + Math.random() * (W - 120);
    this.y = H + this.radius + 10;
    const targetHeightFactor = 0.35 + Math.random() * 0.35;
    this.vy = -Math.sqrt(2 * GRAVITY * H * (0.55 + targetHeightFactor));
    this.vx = (Math.random() - 0.5) * 200;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 2;
    this.sliced = false;
    this.dead = false;
    this.fuseFlicker = 0;
  }
  update(dt) {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;
    this.fuseFlicker += dt * 12;
    if (this.y - this.radius > H + 40) this.dead = true;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1b1e26";
    ctx.shadowColor = "#e0483e";
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.shadowBlur = 0;
    ctx.fill();
    // fuse
    ctx.strokeStyle = "#8a92a6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -this.radius);
    ctx.quadraticCurveTo(8, -this.radius - 12, 4, -this.radius - 20);
    ctx.stroke();
    const glow = 0.5 + 0.5 * Math.sin(this.fuseFlicker);
    ctx.beginPath();
    ctx.arc(4, -this.radius - 20, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(242, 193, 78, ${0.6 + glow * 0.4})`;
    ctx.shadowColor = "#f2c14e";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }
}

/* ---------- Particules (jus + moities) ---------- */
class Half {
  constructor(fruit, dir) {
    this.x = fruit.x;
    this.y = fruit.y;
    this.radius = fruit.radius;
    this.color = fruit.color;
    this.fleshColor = fruit.fleshColor;
    this.dir = dir; // -1 or 1
    this.vx = fruit.vx * 0.5 + dir * (100 + Math.random() * 80);
    this.vy = fruit.vy * 0.5 - 60 - Math.random() * 60;
    this.rotation = fruit.rotation;
    this.rotSpeed = dir * (2 + Math.random() * 2);
    this.life = 1.4;
  }
  update(dt) {
    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotSpeed * dt;
    this.life -= dt;
  }
  draw() {
    if (this.life <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, this.dir > 0 ? -Math.PI / 2 : Math.PI / 2, this.dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.72, this.dir > 0 ? -Math.PI / 2 : Math.PI / 2, this.dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.closePath();
    ctx.fillStyle = this.fleshColor;
    ctx.fill();
    ctx.restore();
  }
}

class Splash {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.vx = (Math.random() - 0.5) * 260;
    this.vy = (Math.random() - 1.2) * 260;
    this.radius = 2 + Math.random() * 4;
    this.life = 0.6 + Math.random() * 0.4;
    this.maxLife = this.life;
  }
  update(dt) {
    this.vy += GRAVITY * 0.6 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw() {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

class BombFlash {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 0.5;
    this.maxLife = 0.5;
  }
  update(dt) { this.life -= dt; }
  draw() {
    if (this.life <= 0) return;
    const t = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = t;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 140 * (1 - t) + 20);
    grad.addColorStop(0, "rgba(255,220,150,0.9)");
    grad.addColorStop(0.4, "rgba(224,72,62,0.6)");
    grad.addColorStop(1, "rgba(224,72,62,0)");
    ctx.beginPath();
    ctx.arc(this.x, this.y, 140 * (1 - t) + 20, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }
}

/* ---------- Collision segment-cercle ---------- */
function segCircleHit(p1, p2, cx, cy, r) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((cx - p1.x) * dx + (cy - p1.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = p1.x + t * dx;
  const closestY = p1.y + t * dy;
  const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
  return distSq <= r * r;
}

function checkSliceAlongSegment(p1, p2) {
  for (const f of fruits) {
    if (f.sliced || f.dead) continue;
    if (segCircleHit(p1, p2, f.x, f.y, f.radius)) {
      sliceEntity(f, p2);
    }
  }
}

function sliceEntity(entity, atPoint) {
  entity.sliced = true;
  if (entity.isBomb) {
    triggerBombHit(entity);
    return;
  }
  score += entity.points;
  combo += 1;
  comboTimer = 0.9;
  updateHUD();
  particles.push(new Half(entity, -1));
  particles.push(new Half(entity, 1));
  for (let i = 0; i < 10; i++) {
    particles.push(new Splash(entity.x, entity.y, entity.fleshColor));
  }
  spawnScorePop(entity.x, entity.y, `+${entity.points}${combo > 1 ? " x" + combo : ""}`);
}

let scorePops = [];
function spawnScorePop(x, y, text) {
  scorePops.push({ x, y, text, life: 0.9, maxLife: 0.9 });
}

function triggerBombHit(bomb) {
  particles.push(new BombFlash(bomb.x, bomb.y));
  shakeTime = 0.35;
  loseAllLives();
}

/* ---------- Vies / score ---------- */
function updateHUD() {
  scoreEl.textContent = score;
  comboEl.textContent = "x" + combo;
}

function loseLife() {
  lives = Math.max(0, lives - 1);
  renderLives();
  if (lives <= 0) endGame();
}

function loseAllLives() {
  lives = 0;
  renderLives();
  endGame();
}

function renderLives() {
  lifeIcons.forEach((el, i) => {
    el.classList.toggle("lost", i >= lives);
  });
}

/* ---------- Boucle de jeu ---------- */
function spawnWave() {
  const count = 1 + (Math.random() < Math.min(0.5, elapsed / 40) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    fruits.push(new Fruit());
  }
  if (elapsed > 6 && Math.random() < Math.min(0.35, 0.08 + elapsed / 120)) {
    fruits.push(new Bomb());
  }
}

function update(dt) {
  elapsed += dt;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnWave();
    spawnInterval = Math.max(0.55, 1.1 - elapsed / 90);
    spawnTimer = spawnInterval;
  }

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }

  for (const f of fruits) {
    f.update(dt);
    if (!f.isBomb && f.dead && !f.sliced) {
      loseLife();
    }
  }
  fruits = fruits.filter((f) => !f.dead);

  for (const p of particles) p.update(dt);
  particles = particles.filter((p) => p.life > 0);

  for (const s of scorePops) s.life -= dt;
  scorePops = scorePops.filter((s) => s.life > 0);

  // fade trail
  const now = performance.now();
  trail = trail.filter((pt) => now - pt.t < 160);

  if (shakeTime > 0) shakeTime -= dt;

  updateHUD();
}

function drawTrail() {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const alpha = i / trail.length;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(242, 193, 78, ${alpha * 0.9})`;
    ctx.lineWidth = 6 * alpha;
    ctx.shadowColor = "#f2c14e";
    ctx.shadowBlur = 12;
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (shakeTime > 0) {
    const mag = shakeTime * 18;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }
  ctx.clearRect(-30, -30, W + 60, H + 60);

  for (const p of particles) p.draw();
  for (const f of fruits) if (!f.sliced) f.draw();
  drawTrail();

  ctx.font = "700 20px Sora, sans-serif";
  ctx.textAlign = "center";
  for (const s of scorePops) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
    ctx.fillStyle = "#f2c14e";
    ctx.shadowColor = "#f2c14e";
    ctx.shadowBlur = 10;
    ctx.fillText(s.text, s.x, s.y - (1 - s.life / s.maxLife) * 40);
    ctx.restore();
  }

  ctx.restore();
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.035, (ts - lastTime) / 1000 || 0);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------- Démarrage / fin ---------- */
function startGame() {
  resize();
  fruits = [];
  particles = [];
  scorePops = [];
  trail = [];
  score = 0;
  combo = 0;
  comboTimer = 0;
  lives = 3;
  elapsed = 0;
  spawnTimer = 0.4;
  renderLives();
  updateHUD();
  startScreen.classList.add("hidden");
  gameoverScreen.classList.add("hidden");
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  const best = Math.max(score, parseInt(localStorage.getItem(BEST_KEY) || "0", 10));
  localStorage.setItem(BEST_KEY, String(best));
  finalScoreEl.textContent = score;
  bestScoreLine.textContent = `Meilleur score : ${best}`;
  gameoverScreen.classList.remove("hidden");
}

startBtn.addEventListener("click", startGame);
retryBtn.addEventListener("click", startGame);

resize();
draw();
