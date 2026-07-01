/* ===== 🐍 Neon Snake — smooth movement + power apples ===== */

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const GRID = 25;                    // cells per row/col (bigger map)
const CELL = canvas.width / GRID;   // pixel size of a cell (24px)

// ---- DOM ----
const scoreEl   = document.getElementById("score");
const bestEl    = document.getElementById("best");
const overlay   = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText  = document.getElementById("overlay-text");
const startBtn  = document.getElementById("start-btn");
const wrapToggle = document.getElementById("wrap-toggle");
const canvasHolder = document.querySelector(".canvas-holder");
const powerbar  = document.getElementById("powerbar");

// ---- Power-up definitions ----
const POWERS = {
  slow:   { emoji: "🐌", color: "#7b5cff", glow: "#c6b8ff", label: "Slow-Mo", duration: 6000 },
  double: { emoji: "🌈", color: "#00b3ff", glow: "#a6e6ff", label: "2× Score", duration: 8000 },
  shield: { emoji: "🛡️", color: "#00ff7b", glow: "#b0ffd6", label: "Shield",  duration: 7000 },
  shrink: { emoji: "✂️", color: "#ff9d00", glow: "#ffd591", label: "Shrink!",  duration: 0 },
};
const POWER_KEYS = Object.keys(POWERS);

// ---- Game state ----
let snake, prevSnake, dir, nextDir;
let food, bonus, power, bonusTicks, powerTicks;
let active = {};                // timed powers: type -> ms remaining
let score, best = Number(localStorage.getItem("neonSnakeBest") || 0);
let appleCount = 0;
let speed = 140;
let running = false;
let raf = null;
let lastTime = 0, acc = 0;
let particles = [];

bestEl.textContent = best;

// ---- Helpers ----
const rand = (n) => Math.floor(Math.random() * n);
const occupied = (c) =>
  snake.some(s => s.x === c.x && s.y === c.y) ||
  (food && food.x === c.x && food.y === c.y) ||
  (bonus && bonus.x === c.x && bonus.y === c.y) ||
  (power && power.x === c.x && power.y === c.y);

function emptyCell() {
  let c;
  do { c = { x: rand(GRID), y: rand(GRID) }; } while (occupied(c));
  return c;
}

function reset() {
  snake = [
    { x: 9, y: 12 }, { x: 8, y: 12 },
    { x: 7, y: 12 }, { x: 6, y: 12 },
  ];
  prevSnake = snake.map(s => ({ ...s }));
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  appleCount = 0;
  bonus = null; bonusTicks = 0;
  power = null; powerTicks = 0;
  active = {};
  particles = [];
  acc = 0;
  food = emptyCell();
  scoreEl.textContent = score;
  renderPowerbar();
}

// current milliseconds per step (Slow-Mo stretches it)
function stepInterval() {
  return active.slow ? speed * 1.8 : speed;
}

// ---- Input ----
const KEYMAP = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
};

function setDir(nd) {
  if (nd.x === -dir.x && nd.y === -dir.y) return; // no 180° reversal
  nextDir = nd;
}

document.addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); togglePause(); return; }
  const nd = KEYMAP[e.key];
  if (nd) { e.preventDefault(); setDir(nd); }
});

document.querySelectorAll(".dbtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const map = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
    setDir(map[btn.dataset.dir]);
  });
});

let touchStart = null;
canvas.addEventListener("touchstart", (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
canvas.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > Math.abs(dy)) setDir({ x: dx > 0 ? 1 : -1, y: 0 });
  else setDir({ x: 0, y: dy > 0 ? 1 : -1 });
  touchStart = null;
});

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    speed = Number(chip.dataset.speed);
  });
});

startBtn.addEventListener("click", startGame);

// ---- Particles ----
function spawnParticles(cx, cy, color, n = 16) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: cx, y: cy,
      vx: (Math.random() - 0.5) * 5,
      vy: (Math.random() - 0.5) * 5,
      life: 1, color,
    });
  }
}
function updateParticles(dt) {
  const f = dt / 16;
  particles.forEach(p => {
    p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.08 * f;
    p.life -= 0.03 * f;
  });
  particles = particles.filter(p => p.life > 0);
}

function floatText(cellX, cellY, text, color = "#ffe600") {
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

// ---- Powers ----
function applyPower(type, hx, hy) {
  const p = POWERS[type];
  spawnParticles(hx * CELL + CELL / 2, hy * CELL + CELL / 2, p.color, 22);

  if (type === "shrink") {
    // cut the snake roughly in half — instant relief when you're huge
    const keep = Math.max(4, Math.ceil(snake.length / 2));
    snake.length = keep;
    prevSnake = prevSnake.slice(0, keep);
    score += 20;
    floatText(hx, hy, "✂️ Shrink!", p.color);
  } else {
    active[type] = p.duration;
    floatText(hx, hy, p.emoji + " " + p.label, p.color);
  }
  renderPowerbar();
}

function renderPowerbar() {
  powerbar.innerHTML = "";
  for (const type of POWER_KEYS) {
    if (!active[type]) continue;
    const p = POWERS[type];
    const badge = document.createElement("div");
    badge.className = "pbadge";
    badge.style.background = `linear-gradient(90deg, ${p.color}, ${p.glow})`;
    badge.innerHTML = `${p.emoji} ${p.label} <span class="time">${(active[type] / 1000).toFixed(1)}s</span>`;
    powerbar.appendChild(badge);
  }
}

// ---- Logic step (grid based) ----
function step() {
  dir = nextDir;
  prevSnake = snake.map(s => ({ ...s }));

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  const shielded = active.shield > 0;

  // Walls
  const wrapping = wrapToggle.checked || shielded;
  if (wrapping) {
    head.x = (head.x + GRID) % GRID;
    head.y = (head.y + GRID) % GRID;
  } else if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
    return gameOver();
  }

  // Self collision (Shield saves you)
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    if (shielded) {
      active.shield = 0;
      spawnParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, "#00ff7b", 24);
      floatText(head.x, head.y, "🛡️ Saved!", "#00ff7b");
      renderPowerbar();
    } else {
      return gameOver();
    }
  }

  snake.unshift(head);
  let grew = false;

  // Normal apple → +score, snake grows
  if (head.x === food.x && head.y === food.y) {
    const gain = active.double ? 20 : 10;
    score += gain;
    appleCount++;
    spawnParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, "#ff5e7e");
    floatText(head.x, head.y, "+" + gain, active.double ? "#00b3ff" : "#ffb3c6");
    food = emptyCell();
    grew = true;

    // Every 5 apples → golden bonus; else 45% chance to drop a power apple
    if (appleCount % 5 === 0 && !bonus) {
      bonus = emptyCell();
      bonusTicks = Math.ceil(6500 / speed);
    } else if (!power && Math.random() < 0.45) {
      const type = POWER_KEYS[rand(POWER_KEYS.length)];
      power = { ...emptyCell(), type };
      powerTicks = Math.ceil(8000 / speed);
    }
  }

  // Golden bonus → big points
  if (bonus && head.x === bonus.x && head.y === bonus.y) {
    const gain = active.double ? 100 : 50;
    score += gain;
    spawnParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, "#ffe600", 24);
    floatText(head.x, head.y, "+" + gain + " ⭐", "#ffe600");
    bonus = null; bonusTicks = 0;
    grew = true;
  }

  // Power apple → apply effect
  if (power && head.x === power.x && head.y === power.y) {
    applyPower(power.type, head.x, head.y);
    power = null; powerTicks = 0;
  }

  if (!grew) snake.pop();

  // Timers measured in steps
  if (bonus && --bonusTicks <= 0) bonus = null;
  if (power && --powerTicks <= 0) power = null;

  // Score / best
  scoreEl.textContent = score;
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    localStorage.setItem("neonSnakeBest", best);
  }
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

// interpolate a segment between its previous and current cell
function lerpCell(from, to, t) {
  let fx = from.x, fy = from.y;
  if (Math.abs(to.x - fx) > 1) fx = to.x; // wrap jump → snap, don't slide across
  if (Math.abs(to.y - fy) > 1) fy = to.y;
  return { x: fx + (to.x - fx) * t, y: fy + (to.y - fy) * t };
}

function drawGlyph(cx, cy, emoji, color, glow, scale) {
  ctx.save();
  ctx.shadowBlur = 22;
  ctx.shadowColor = glow;
  ctx.fillStyle = color;
  const size = CELL * scale;
  const off = (CELL - size) / 2;
  roundRect(cx * CELL + off + 2, cy * CELL + off + 2, size - 4, size - 4, 7);
  ctx.fill();
  ctx.restore();
  ctx.font = `${CELL * 0.72}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, cx * CELL + CELL / 2, cy * CELL + CELL / 2 + 1);
}

function draw(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = Date.now();

  // Apple (pulsing)
  drawGlyph(food.x, food.y, "🍎", "#ff2e97", "#ff8ec2", 1 + Math.sin(now / 150) * 0.08);

  // Golden bonus (flashes near expiry)
  if (bonus) {
    const flashing = bonusTicks < 12 && Math.floor(now / 140) % 2 === 0;
    if (!flashing) drawGlyph(bonus.x, bonus.y, "⭐", "#ffe600", "#fff6a0", 1 + Math.sin(now / 90) * 0.15);
  }

  // Power apple (flashes near expiry)
  if (power) {
    const p = POWERS[power.type];
    const flashing = powerTicks < 12 && Math.floor(now / 140) % 2 === 0;
    if (!flashing) drawGlyph(power.x, power.y, p.emoji, p.color, p.glow, 1 + Math.sin(now / 110) * 0.12);
  }

  // Snake — rainbow body, glowing head, smooth interpolation
  const shielded = active.shield > 0;
  for (let i = snake.length - 1; i >= 0; i--) {
    const from = i < prevSnake.length ? prevSnake[i] : snake[i];
    const pos = lerpCell(from, snake[i], t);
    const px = pos.x * CELL, py = pos.y * CELL;
    const isHead = i === 0;
    const hue = (i * 10 + now / 20) % 360;

    ctx.save();
    ctx.shadowBlur = isHead ? 20 : 9;
    ctx.shadowColor = shielded ? "#00ff7b" : `hsl(${hue}, 100%, 60%)`;
    ctx.fillStyle = isHead
      ? (shielded ? "#a6ffcf" : "#00ffc6")
      : `hsl(${hue}, 85%, ${62 - Math.min(i, 22)}%)`;
    const pad = isHead ? 1 : 2;
    roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 7);
    ctx.fill();
    ctx.restore();

    if (isHead) {
      const cx = px + CELL / 2, cy = py + CELL / 2, o = CELL * 0.2;
      // eyes offset perpendicular to travel + forward
      const fx = dir.x * o, fy = dir.y * o;
      const perpx = dir.y * o, perpy = dir.x * o;
      ctx.fillStyle = "#06121a";
      ctx.beginPath();
      ctx.arc(cx + fx + perpx, cy + fy + perpy, 2.4, 0, 7);
      ctx.arc(cx + fx - perpx, cy + fy - perpy, 2.4, 0, 7);
      ctx.fill();
    }
  }

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---- Main loop (fixed-step logic, smooth render) ----
function frame(now) {
  if (!running) return;
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;
  acc += dt;

  // countdown timed powers
  let changed = false;
  for (const type of POWER_KEYS) {
    if (active[type] > 0) {
      active[type] -= dt;
      if (active[type] <= 0) { active[type] = 0; }
      changed = true;
    }
  }
  if (changed) renderPowerbar();

  const si = stepInterval();
  while (acc >= si) { acc -= si; step(); }

  updateParticles(dt);
  draw(Math.min(acc / si, 1));
  raf = requestAnimationFrame(frame);
}

// ---- Flow ----
function startGame() {
  reset();
  overlay.classList.add("hidden");
  running = true;
  lastTime = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function togglePause() {
  if (overlay.classList.contains("hidden") === false && !running) return;
  if (running) {
    running = false;
    showOverlay("⏸ Paused", "Take a breath. Press Space or Play to resume.");
    startBtn.textContent = "▶ Resume";
  } else {
    overlay.classList.add("hidden");
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function gameOver() {
  running = false;
  cancelAnimationFrame(raf);
  canvasHolder.classList.add("shake");
  setTimeout(() => canvasHolder.classList.remove("shake"), 350);

  const record = score >= best && score > 0;
  showOverlay(
    record ? "🏆 New Best!" : "💥 Game Over",
    `You scored ${score} with a snake ${snake.length} long.`
  );
  startBtn.textContent = "↻ Play Again";
  // ensure the crash frame is painted
  draw(1);
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

// Idle preview before first play
reset();
draw(1);
