const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const N = 17; // casas por lado
const DIRS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
const KEYS = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
};

let size = 0, cell = 0;
let state = "ready";           // ready | running | over
let snake = [], dir = DIRS.right, nextDir = DIRS.right, food = null, score = 0, best = 0, timer = null;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  size = canvas.clientWidth;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = size / N;
  draw();
}

function reset() {
  const mid = Math.floor(N / 2);
  snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
  dir = DIRS.right;
  nextDir = DIRS.right;
  score = 0;
  $("score").textContent = "0";
  placeFood();
}

function placeFood() {
  do {
    food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
  } while (snake.some((s) => s.x === food.x && s.y === food.y));
}

function start() {
  if (state === "running") return;
  reset();
  state = "running";
  $("msg").hidden = true;
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  tick();
}

// não deixa virar para trás de uma vez (a cobra bateria em si mesma)
function turn(name) {
  if (state !== "running") return start();
  const d = DIRS[name];
  if (d[0] === -dir[0] && d[1] === -dir[1]) return;
  nextDir = d;
}

function tick() {
  if (state !== "running") return;
  dir = nextDir;
  const head = { x: snake[0].x + dir[0], y: snake[0].y + dir[1] };
  const eats = head.x === food.x && head.y === food.y;
  const body = eats ? snake : snake.slice(0, -1); // o rabo sai do lugar quando não come
  const out = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
  if (out || body.some((s) => s.x === head.x && s.y === head.y)) return gameOver();

  snake.unshift(head);
  if (eats) {
    score++;
    $("score").textContent = score;
    if (snake.length === N * N) return gameOver();
    placeFood();
  } else {
    snake.pop();
  }
  draw();
  timer = setTimeout(tick, Math.max(65, 150 - score * 3)); // fica mais rápida a cada maçã
}

function gameOver() {
  clearTimeout(timer);
  state = "over";
  draw();
  const record = score > best;
  best = saveRecord("cobrinha", score);
  $("best").textContent = best;
  $("msgText").textContent = "💥 Fim de jogo!";
  $("msg").hidden = false;
  $("result").textContent = `Você comeu ${score} maçã${score === 1 ? "" : "s"}` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

function draw() {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#3a0508" : "#46070c";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  if (food) {
    ctx.fillStyle = "#000"; // emoji usa a transparência da cor atual: precisa ser opaca
    ctx.font = `${cell * 0.9}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍎", (food.x + 0.5) * cell, (food.y + 0.55) * cell);
  }
  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#ff9d00" : "#ffd24a";
    const pad = i === 0 ? 1 : 2;
    ctx.beginPath();
    ctx.roundRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.3);
    ctx.fill();
  });
}

document.addEventListener("keydown", (e) => {
  if (KEYS[e.code]) {
    e.preventDefault();
    turn(KEYS[e.code]);
  }
});

// deslizar o dedo na área do jogo
let touchStart = null;
const arena = $("arena");
arena.addEventListener("pointerdown", (e) => { touchStart = { x: e.clientX, y: e.clientY }; });
arena.addEventListener("pointerup", (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
    if (state !== "running") start();
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? "right" : "left");
  else turn(dy > 0 ? "down" : "up");
});

document.querySelectorAll(".pad button").forEach((b) => {
  b.addEventListener("click", () => turn(b.dataset.dir));
});
$("again").addEventListener("click", start);
window.addEventListener("resize", resize);

checkSession().then(() => {
  best = saveRecord("cobrinha", 0);
  $("best").textContent = best;
  reset();
  resize();
});
