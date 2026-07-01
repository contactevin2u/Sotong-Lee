/* ===== 🐍 Neon Snake — Local 2-Player =====
   P1: WASD   ·   P2: Arrow keys
   Same screen, shared fruit, last snake alive wins the round.
   Each player picks their own snake skin before playing. */

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const GRID = 25;
const CELL = canvas.width / GRID;

// ---- DOM ----
const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const wins1El  = document.getElementById("wins1");
const wins2El  = document.getElementById("wins2");
const roundEl  = document.getElementById("round");
const overlay  = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText  = document.getElementById("overlay-text");
const startBtn = document.getElementById("start-btn");
const wrapToggle = document.getElementById("wrap-toggle");
const canvasHolder = document.querySelector(".canvas-holder");
const skinPick = document.getElementById("skin-pick");
const root = document.documentElement;

// ---- Snake skins (players choose before playing) ----
// body(i, now) returns the fill color for body segment i
const SKINS = [
  { id: "emerald",  name: "Emerald",  head: "#00ffc6", glow: "#b0ffe6", body: i => `hsl(${160 + (i * 3) % 40}, 90%, ${62 - Math.min(i, 22)}%)` },
  { id: "flamingo", name: "Flamingo", head: "#ff2e97", glow: "#ffb3d6", body: i => `hsl(${320 + (i * 3) % 40}, 90%, ${62 - Math.min(i, 22)}%)` },
  { id: "ocean",    name: "Ocean",    head: "#00b3ff", glow: "#a6e6ff", body: i => `hsl(${198 + (i * 3) % 40}, 92%, ${62 - Math.min(i, 22)}%)` },
  { id: "gold",     name: "Gold",     head: "#ffe600", glow: "#fff6a0", body: i => `hsl(${45 + (i * 2) % 20}, 95%, ${60 - Math.min(i, 20)}%)` },
  { id: "violet",   name: "Violet",   head: "#b98cff", glow: "#e0ccff", body: i => `hsl(${265 + (i * 3) % 40}, 85%, ${64 - Math.min(i, 22)}%)` },
  { id: "lava",     name: "Lava",     head: "#ff6a00", glow: "#ffb27a", body: i => `hsl(${i % 2 ? 12 : 32}, 95%, ${58 - Math.min(i, 20)}%)` },
  { id: "toxic",    name: "Toxic",    head: "#aaff00", glow: "#e2ffb0", body: i => `hsl(${i % 2 ? 80 : 95}, 95%, ${58 - Math.min(i, 20)}%)` },
  { id: "rainbow",  name: "Rainbow",  head: "#ffffff", glow: "#ffffff", body: (i, now) => `hsl(${(i * 12 + now / 20) % 360}, 95%, 60%)` },
];
const skinById = (id) => SKINS.find(s => s.id === id) || SKINS[0];

// chosen skins per player
let chosen = { 1: "emerald", 2: "flamingo" };

// ---- Game state ----
let players, prevSnakes, food;
let particles = [];
let speed = 100;
let winTarget = 3;
let running = false;
let raf = null, lastTime = 0, acc = 0;
let wins = { 1: 0, 2: 0 };
let round = 1;
// phase: menu | playing | paused | roundend | matchend
let phase = "menu";

// ---- Skin picker UI ----
function swatchGradient(skin) {
  // little preview: head color → a mid body tone
  return `linear-gradient(135deg, ${skin.head}, ${skin.body(6, 0)})`;
}
function buildSwatches() {
  [1, 2].forEach(pid => {
    const box = document.getElementById("swatches" + pid);
    box.innerHTML = "";
    SKINS.forEach(skin => {
      const b = document.createElement("button");
      b.className = "swatch";
      b.type = "button";
      b.title = skin.name;
      b.style.background = swatchGradient(skin);
      b.style.color = skin.head; // drives the active glow
      b.dataset.skin = skin.id;
      b.addEventListener("click", () => {
        chosen[pid] = skin.id;
        refreshSwatches();
        applyThemeVars();
      });
      box.appendChild(b);
    });
  });
  refreshSwatches();
}
function refreshSwatches() {
  [1, 2].forEach(pid => {
    const other = pid === 1 ? 2 : 1;
    document.querySelectorAll("#swatches" + pid + " .swatch").forEach(b => {
      const id = b.dataset.skin;
      b.classList.toggle("active", chosen[pid] === id);
      b.disabled = chosen[other] === id;   // can't both pick the same skin
    });
  });
}
function applyThemeVars() {
  const s1 = skinById(chosen[1]), s2 = skinById(chosen[2]);
  root.style.setProperty("--p1", s1.head);
  root.style.setProperty("--p1-glow", s1.glow);
  root.style.setProperty("--p2", s2.head);
  root.style.setProperty("--p2-glow", s2.glow);
}

// ---- Helpers ----
const rand = (n) => Math.floor(Math.random() * n);
function cellTaken(c) {
  if (food && food.x === c.x && food.y === c.y) return true;
  return players.some(p => p.snake.some(s => s.x === c.x && s.y === c.y));
}
function emptyCell() {
  let c;
  do { c = { x: rand(GRID), y: rand(GRID) }; } while (cellTaken(c));
  return c;
}
function makePlayer(id, startX, startY, dx) {
  const snake = [];
  for (let i = 0; i < 4; i++) snake.push({ x: startX - dx * i, y: startY });
  return { id, snake, dir: { x: dx, y: 0 }, nextDir: { x: dx, y: 0 }, alive: true, score: 0, skin: skinById(chosen[id]) };
}
function resetRound() {
  players = [
    makePlayer(1, 6, 6, 1),
    makePlayer(2, GRID - 7, GRID - 7, -1),
  ];
  prevSnakes = players.map(p => p.snake.map(s => ({ ...s })));
  particles = [];
  acc = 0;
  food = emptyCell();
  score1El.textContent = "0";
  score2El.textContent = "0";
  roundEl.textContent = round;
}

// ---- Input ----
const KEYMAP = {
  w: [1, { x: 0, y: -1 }], W: [1, { x: 0, y: -1 }],
  s: [1, { x: 0, y: 1 }],  S: [1, { x: 0, y: 1 }],
  a: [1, { x: -1, y: 0 }], A: [1, { x: -1, y: 0 }],
  d: [1, { x: 1, y: 0 }],  D: [1, { x: 1, y: 0 }],
  ArrowUp:    [2, { x: 0, y: -1 }],
  ArrowDown:  [2, { x: 0, y: 1 }],
  ArrowLeft:  [2, { x: -1, y: 0 }],
  ArrowRight: [2, { x: 1, y: 0 }],
};
function setDir(playerId, nd) {
  if (!players) return;
  const p = players.find(pl => pl.id === playerId);
  if (!p || !p.alive) return;
  if (nd.x === -p.dir.x && nd.y === -p.dir.y) return; // no 180° reversal
  p.nextDir = nd;
}
document.addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); togglePause(); return; }
  const entry = KEYMAP[e.key];
  if (entry) { e.preventDefault(); setDir(entry[0], entry[1]); }
});

const DIRV = { up: {x:0,y:-1}, down: {x:0,y:1}, left: {x:-1,y:0}, right: {x:1,y:0} };
document.querySelectorAll(".pad").forEach(pad => {
  const pid = Number(pad.dataset.player);
  pad.querySelectorAll(".tbtn").forEach(btn => {
    const fire = (e) => { e.preventDefault(); setDir(pid, DIRV[btn.dataset.dir]); };
    btn.addEventListener("touchstart", fire, { passive: false });
    btn.addEventListener("mousedown", fire);
  });
});

document.querySelectorAll(".chip[data-speed]").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-speed]").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    speed = Number(chip.dataset.speed);
  });
});
document.querySelectorAll(".chip[data-wins]").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-wins]").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    winTarget = Number(chip.dataset.wins);
  });
});

// ---- Particles / floaters ----
function spawnParticles(cx, cy, color, n = 16) {
  for (let i = 0; i < n; i++) {
    particles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1, color });
  }
}
function updateParticles(dt) {
  const f = dt / 16;
  particles.forEach(p => { p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.08 * f; p.life -= 0.03 * f; });
  particles = particles.filter(p => p.life > 0);
}
function floatText(cellX, cellY, text, color) {
  const el = document.createElement("div");
  el.className = "floater";
  el.textContent = text;
  el.style.color = color;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;
  el.style.left = (cellX * CELL + CELL / 2) * scale + "px";
  el.style.top = (cellY * CELL) * scale + "px";
  canvasHolder.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// ---- Logic step ----
function step() {
  prevSnakes = players.map(p => p.snake.map(s => ({ ...s })));
  const wrapping = wrapToggle.checked;
  const newHeads = {};

  // advance heads + wall check
  for (const p of players) {
    if (!p.alive) continue;
    p.dir = p.nextDir;
    let hx = p.snake[0].x + p.dir.x;
    let hy = p.snake[0].y + p.dir.y;
    if (wrapping) { hx = (hx + GRID) % GRID; hy = (hy + GRID) % GRID; }
    else if (hx < 0 || hx >= GRID || hy < 0 || hy >= GRID) { p.alive = false; continue; }
    newHeads[p.id] = { x: hx, y: hy };
  }

  // collisions vs current bodies + head-to-head
  const dead = new Set();
  for (const p of players) {
    if (!p.alive) continue;
    const head = newHeads[p.id];
    for (const other of players) {
      const body = other.snake;
      for (let i = 0; i < body.length; i++) {
        if (other.id === p.id && i === body.length - 1) continue; // own moving tail is ok
        if (body[i].x === head.x && body[i].y === head.y) dead.add(p.id);
      }
    }
    for (const q of players) {
      if (q.id === p.id || !q.alive) continue;
      const qh = newHeads[q.id];
      if (qh && qh.x === head.x && qh.y === head.y) { dead.add(p.id); dead.add(q.id); }
    }
  }

  // move + eat
  let ate = false;
  for (const p of players) {
    if (!p.alive) continue;
    if (dead.has(p.id)) { p.alive = false; continue; }
    const head = newHeads[p.id];
    p.snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      p.score += 10;
      spawnParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, p.skin.head);
      floatText(head.x, head.y, "+10", p.skin.glow);
      ate = true;
    } else {
      p.snake.pop();
    }
  }
  if (ate) food = emptyCell();

  for (const id of dead) {
    const p = players.find(pl => pl.id === id);
    const h = p.snake[0];
    spawnParticles(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, "#ffffff", 26);
  }

  score1El.textContent = players[0].score;
  score2El.textContent = players[1].score;

  if (players.filter(p => p.alive).length <= 1) endRound();
}

// ---- Rendering ----
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function lerpCell(from, to, t) {
  let fx = from.x, fy = from.y;
  if (Math.abs(to.x - fx) > 1) fx = to.x;
  if (Math.abs(to.y - fy) > 1) fy = to.y;
  return { x: fx + (to.x - fx) * t, y: fy + (to.y - fy) * t };
}
function drawGlyph(cx, cy, emoji, color, glow, scale) {
  ctx.save();
  ctx.shadowBlur = 22; ctx.shadowColor = glow; ctx.fillStyle = color;
  const size = CELL * scale, off = (CELL - size) / 2;
  roundRect(cx * CELL + off + 2, cy * CELL + off + 2, size - 4, size - 4, 7);
  ctx.fill();
  ctx.restore();
  ctx.font = `${CELL * 0.72}px serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(emoji, cx * CELL + CELL / 2, cy * CELL + CELL / 2 + 1);
}
function drawSnake(p, prev, t, now) {
  const skin = p.skin;
  for (let i = p.snake.length - 1; i >= 0; i--) {
    const from = i < prev.length ? prev[i] : p.snake[i];
    const pos = lerpCell(from, p.snake[i], t);
    const px = pos.x * CELL, py = pos.y * CELL;
    const isHead = i === 0;

    ctx.save();
    ctx.shadowBlur = isHead ? 20 : 9;
    ctx.shadowColor = skin.glow;
    ctx.fillStyle = isHead ? skin.head : skin.body(i, now);
    if (!p.alive) ctx.globalAlpha = 0.35;
    const pad = isHead ? 1 : 2;
    roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 7);
    ctx.fill();
    ctx.restore();

    if (isHead) {
      const cx = px + CELL / 2, cy = py + CELL / 2, o = CELL * 0.2;
      const fx = p.dir.x * o, fy = p.dir.y * o;
      const perpx = p.dir.y * o, perpy = p.dir.x * o;
      ctx.fillStyle = "#06121a";
      ctx.beginPath();
      ctx.arc(cx + fx + perpx, cy + fy + perpy, 2.4, 0, 7);
      ctx.arc(cx + fx - perpx, cy + fy - perpy, 2.4, 0, 7);
      ctx.fill();
    }
  }
}
function draw(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = Date.now();
  if (food) drawGlyph(food.x, food.y, "🍎", "#ff2e97", "#ff8ec2", 1 + Math.sin(now / 150) * 0.08);
  players.forEach((p, idx) => drawSnake(p, prevSnakes[idx], t, now));
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---- Main loop ----
function frame(now) {
  if (!running) return;
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  acc += dt;
  while (acc >= speed && running) { acc -= speed; step(); }
  updateParticles(dt);
  draw(running ? Math.min(acc / speed, 1) : 1);
  raf = requestAnimationFrame(frame);
}

// ---- Flow ----
function beginRun() {
  overlay.classList.add("hidden");
  running = true;
  phase = "playing";
  lastTime = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}
function newMatch() {
  wins = { 1: 0, 2: 0 };
  round = 1;
  wins1El.textContent = "0";
  wins2El.textContent = "0";
  // lock in chosen skins
  resetRound();
  beginRun();
}
function nextRound() {
  resetRound();
  beginRun();
}
function togglePause() {
  if (phase === "playing") {
    running = false;
    phase = "paused";
    startBtn.textContent = "▶ Resume";
    skinPick.style.display = "none";
    showOverlay("⏸ Paused", "Press Space or Resume to continue.");
  } else if (phase === "paused") {
    beginRun();
  }
}
startBtn.addEventListener("click", () => {
  if (phase === "menu" || phase === "matchend") newMatch();
  else if (phase === "roundend") nextRound();
  else if (phase === "paused") beginRun();
});

function endRound() {
  running = false;
  cancelAnimationFrame(raf);
  canvasHolder.classList.add("shake");
  setTimeout(() => canvasHolder.classList.remove("shake"), 350);
  draw(1);

  const alive = players.filter(p => p.alive);
  let roundWinner = null;
  if (alive.length === 1) roundWinner = alive[0].id;
  else if (players[0].score > players[1].score) roundWinner = 1;
  else if (players[1].score > players[0].score) roundWinner = 2;

  if (roundWinner) {
    wins[roundWinner]++;
    wins1El.textContent = wins[1];
    wins2El.textContent = wins[2];
  }

  skinPick.style.display = "none"; // no re-picking mid-match
  let title, text;

  if (wins[1] >= winTarget || wins[2] >= winTarget) {
    const champ = wins[1] >= winTarget ? 1 : 2;
    phase = "matchend";
    title = `🏆 Player ${champ} wins the match!`;
    text = `Final: P1 ${wins[1]} — ${wins[2]} P2. Play again to pick new skins.`;
    startBtn.textContent = "↻ New Match";
    skinPick.style.display = "";   // allow re-picking for the next match
  } else {
    phase = "roundend";
    title = roundWinner ? `Player ${roundWinner} takes round ${round}!` : `Round ${round} — Draw!`;
    text = `Score: P1 ${players[0].score} — ${players[1].score} P2 · Wins ${wins[1]}–${wins[2]}.`;
    startBtn.textContent = "▶ Next Round";
    round++;
  }
  showOverlay(title, text, roundWinner);
}
function showOverlay(title, text, winnerId) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayTitle.style.color = winnerId === 1 ? skinById(chosen[1]).head
                          : winnerId === 2 ? skinById(chosen[2]).head : "";
  overlay.classList.remove("hidden");
}

// ---- Boot ----
buildSwatches();
applyThemeVars();
resetRound();
draw(1);
