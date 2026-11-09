const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// física em pixels por segundo
const GRAVITY = 2400;
const JUMP_SPEED = 860;
const START_SPEED = 330;
const MAX_SPEED = 820;
const SPEED_GAIN = 12;       // ganho de velocidade por segundo de corrida
const PX_PER_METER = 40;
const FROG_X = 70;
const FROG_SIZE = 44;
const OBSTACLES = [
  { icon: "🪨", size: 34 },
  { icon: "🪵", size: 40 },
  { icon: "🌵", size: 46 },
];

let W = 0, H = 0, ground = 0;
let state = "ready";           // ready | running | over
let frogY = 0, frogVy = 0, speed = START_SPEED, meters = 0;
let obstacles = [], nextGap = 0, scroll = 0, lastTime = 0, best = 0;

// canvas nítido em qualquer tela (densidade de pixels do aparelho)
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ground = H - 40;
  if (state !== "running") draw();
}

function reset() {
  frogY = 0; frogVy = 0; speed = START_SPEED; meters = 0;
  obstacles = []; nextGap = W * 0.8; scroll = 0;
  $("distance").textContent = "0 m";
}

function startRun() {
  if (state === "running") return; // Espaço no botão "Jogar de novo" dispararia duas corridas
  reset();
  state = "running";
  $("overlay").hidden = true;
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function jump() {
  if (state !== "running") return startRun();
  if (frogY === 0) frogVy = JUMP_SPEED;
}

// distância até o próximo obstáculo: sempre maior que um pulo inteiro na velocidade atual
function spawn() {
  const o = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
  obstacles.push({ ...o, x: W + 20 });
  const airTime = (2 * JUMP_SPEED) / GRAVITY;
  nextGap = speed * airTime + 90 + Math.random() * speed * 0.9;
}

function hits(o) {
  // caixas um pouco menores que os desenhos, para a colisão parecer justa
  const fx = FROG_X + 8, fw = FROG_SIZE - 16, fy = ground - frogY - FROG_SIZE + 10, fh = FROG_SIZE - 14;
  const ox = o.x + 6, ow = o.size - 12, oy = ground - o.size + 6, oh = o.size - 6;
  return fx < ox + ow && fx + fw > ox && fy < oy + oh && fy + fh > oy;
}

function loop(now) {
  if (state !== "running") return;
  const dt = Math.min(0.035, (now - lastTime) / 1000);
  lastTime = now;

  speed = Math.min(MAX_SPEED, speed + SPEED_GAIN * dt);
  meters += (speed * dt) / PX_PER_METER;
  scroll = (scroll + speed * dt) % 60;

  frogVy -= GRAVITY * dt;
  frogY = Math.max(0, frogY + frogVy * dt);
  if (frogY === 0) frogVy = 0;

  obstacles.forEach((o) => { o.x -= speed * dt; });
  obstacles = obstacles.filter((o) => o.x > -60);
  const last = obstacles[obstacles.length - 1];
  if (!last || W + 20 - last.x >= nextGap) spawn();

  $("distance").textContent = Math.floor(meters) + " m";
  draw();
  if (obstacles.some(hits)) return gameOver();
  requestAnimationFrame(loop);
}

function gameOver() {
  state = "over";
  const m = Math.floor(meters);
  const record = m > best;
  best = saveRecord("sapos", m);
  $("best").textContent = best + " m";
  $("overlayText").textContent = "💥 Bateu!";
  $("overlay").hidden = false;
  $("result").textContent = `Você correu ${m} m` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

function draw() {
  // lagoa ao fundo, margem com grama e faixas que andam com a corrida
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, "#2a0508");
  sky.addColorStop(1, "#5e0710");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255, 210, 74, .08)";
  for (let x = -scroll * 0.4; x < W; x += 90) ctx.fillRect(x, ground - 70, 50, 3);

  ctx.fillStyle = "#0b4a22";
  ctx.fillRect(0, ground, W, H - ground);
  ctx.fillStyle = "#ffd24a";
  ctx.fillRect(0, ground, W, 3);
  ctx.fillStyle = "rgba(255, 255, 255, .12)";
  for (let x = -scroll; x < W; x += 60) ctx.fillRect(x, ground + 16, 26, 4);

  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#000"; // emoji usa a transparência da cor atual: precisa ser opaca
  obstacles.forEach((o) => {
    ctx.font = `${o.size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.fillText(o.icon, o.x, ground + 4);
  });
  ctx.font = `${FROG_SIZE}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.fillText("🐸", FROG_X, ground - frogY + 6);
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});
document.querySelector(".track").addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
$("again").addEventListener("click", startRun);
window.addEventListener("resize", resize);

checkSession().then(() => {
  best = saveRecord("sapos", 0);
  $("best").textContent = best + " m";
  resize();
});
