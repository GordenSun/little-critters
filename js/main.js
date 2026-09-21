// 主程序：布局、指针、循环、旁白、换一批
import { Rng } from './rng.js';
import { SPECIES, generateBatch } from './species.js';
import { Animal } from './animal.js';
import { drawAnimal, drawName, drawParticle } from './draw.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const captionEl = document.getElementById('caption');
const btnNew = document.getElementById('btnNew');
const batchEl = document.getElementById('batchNo');
const countEl = document.getElementById('countLabel');
const speciesEl = document.getElementById('speciesLabel');
const speciesTotalEl = document.getElementById('speciesTotal');

const rng = new Rng();
let W = 0, H = 0, dpr = 1;
let cols = 6, rows = 3, cellW = 0, cellH = 0, R = 60;
let animals = [];
let leaving = [];
let particles = [];
let batchNo = 0;
let lastSay = -10;
let lastHoverId = null;
let now = performance.now() / 1000;

const pointer = { x: -9999, y: -9999, active: false, type: 'mouse', lastMove: 0 };

// ---------- 旁白 ----------
function say(text, prio = 0) {
  const gap = prio >= 2 ? 0 : prio === 1 ? 0.9 : 2.6;
  if (now - lastSay < gap) return false;
  if (captionEl.textContent === text) return true;
  lastSay = now;
  captionEl.textContent = text;
  captionEl.classList.remove('flash');
  void captionEl.offsetWidth;
  captionEl.classList.add('flash');
  return true;
}

// ---------- 世界接口（给小动物用） ----------
const world = {
  pointer,
  get R() { return R; },
  get cell() { return Math.min(cellW, cellH); },
  say,
  emit(type, x, y, o = {}) {
    particles.push({
      type, x, y, born: now,
      vx: o.vx ?? (Math.random() - 0.5) * R * 0.2,
      vy: o.vy ?? -R * (0.55 + Math.random() * 0.3),
      life: o.life ?? 1.5,
      size: o.size ?? 1,
      glyph: o.glyph,
      phase: Math.random() * 6.28,
    });
  },
  neighborsOf(a) {
    return animals.filter((o) => o !== a && Math.abs(o.col - a.col) <= 1 && Math.abs(o.row - a.row) <= 1);
  },
};

// ---------- 布局 ----------
function place(a) {
  a.cx = (a.col + 0.5) * cellW;
  a.cy = (a.row + 0.5) * cellH + R * 0.12;
}

function layout() {
  const rect = canvas.parentElement.getBoundingClientRect();
  W = Math.max(1, rect.width); H = Math.max(1, rect.height);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

  const newCols = W >= 1180 ? 6 : W >= 920 ? 5 : W >= 680 ? 4 : W >= 440 ? 3 : 2;
  const newRows = Math.max(2, Math.min(4, Math.round(H / ((W / newCols) * 1.05))));
  const changed = newCols !== cols || newRows !== rows;
  cols = newCols; rows = newRows;
  cellW = W / cols; cellH = H / rows;
  R = Math.min(cellW, cellH) * 0.25;

  if (changed || animals.length !== cols * rows) newFriends(true);
  else animals.forEach(place);
}

// ---------- 换一批 ----------
function newFriends(silent = false) {
  const count = cols * rows;
  for (const a of animals) {
    if (a.leaveAt === null) {
      a.leaveAt = now + (a.col * 0.03 + a.row * 0.05);
      leaving.push(a);
    }
  }
  const batch = generateBatch(count, rng);
  animals = batch.map((b, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const a = new Animal(b, col, row, rng, now, 0.28 + col * 0.05 + row * 0.08 + rng.range(0, 0.06));
    place(a);
    return a;
  });
  batchNo++;
  batchEl.textContent = String(batchNo).padStart(3, '0');
  countEl.textContent = count;
  speciesEl.textContent = new Set(animals.map((a) => a.spec.id)).size;
  if (!silent) {
    say('新朋友们来啦！它们还有点认生。', 2);
    btnNew.classList.add('spin');
    setTimeout(() => btnNew.classList.remove('spin'), 600);
  }
}

// ---------- 指针 ----------
function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = e.clientX - rect.left;
  pointer.y = e.clientY - rect.top;
  pointer.active = true;
  pointer.type = e.pointerType || 'mouse';
  pointer.lastMove = now;
}
window.addEventListener('pointermove', setPointer, { passive: true });
window.addEventListener('pointerdown', (e) => {
  setPointer(e);
  if (e.target !== canvas) return;
  let best = null, bestD = Infinity;
  for (const a of animals) {
    const d = Math.hypot(pointer.x - a.cx, pointer.y - a.cy);
    if (d < R * 1.35 && d < bestD) { best = a; bestD = d; }
  }
  if (best) best.boop(now, world);
});
document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
window.addEventListener('pointerout', (e) => { if (!e.relatedTarget && e.pointerType === 'mouse') pointer.active = false; });
window.addEventListener('blur', () => { pointer.active = false; });

// ---------- 按钮 / 键盘 ----------
btnNew.addEventListener('click', () => newFriends());
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    newFriends();
  }
});

// ---------- 主循环 ----------
let last = performance.now();
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  now = ts / 1000;

  // 触屏：手指离开一会儿后就不再盯着
  if (pointer.type === 'touch' && now - pointer.lastMove > 2.5) pointer.active = false;

  // 谁在看鼠标：以指针所在格为中心的 3x3
  let pc = -99, pr = -99;
  if (pointer.active) { pc = Math.floor(pointer.x / cellW); pr = Math.floor(pointer.y / cellH); }
  let hovered = null;
  for (const a of animals) {
    a.attentive = pointer.active && Math.abs(a.col - pc) <= 1 && Math.abs(a.row - pr) <= 1;
    a.hovered = a.attentive && a.col === pc && a.row === pr && Math.hypot(pointer.x - a.cx, pointer.y - a.cy) < R * 1.7;
    if (a.hovered) hovered = a;
  }
  if (hovered && hovered !== lastHoverId && hovered.s.appear > 0.9 && !hovered.petted) {
    say(`${hovered.name}（${hovered.spec.cn}）正盯着你看。`, 1);
  }
  lastHoverId = hovered;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // 离场的
  for (const a of leaving) { a.update(dt, now, world); drawAnimal(ctx, a, R); }
  leaving = leaving.filter((a) => a.s.appear > 0.002);

  // 在场的
  for (const a of animals) { a.update(dt, now, world); drawAnimal(ctx, a, R); }
  for (const a of animals) drawName(ctx, a, R, a.nameShow);

  // 粒子
  particles = particles.filter((p) => now - p.born < p.life);
  for (const p of particles) drawParticle(ctx, p, now, R);

  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
speciesTotalEl.textContent = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN'][SPECIES.length] || SPECIES.length;
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
now = performance.now() / 1000;
layout();
requestAnimationFrame(frame);
