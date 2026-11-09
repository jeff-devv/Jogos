const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// campo fixo de 360 x 480; só a escala muda com a tela
const W = 360, H = 480;
const GRAVITY = 1400;
const FLAP = -420;
const BUG_X = 90, BUG_R = 14;
const PILLAR_W = 56, GAP = 150, SPEED = 150, SPACING = 210;
const GROUND = H - 30;

let state = "ready";           // ready | running | over
let bugY = H / 2, vy = 0, pillars = [], score = 0, best = 0, lastTime = 0, scroll = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  canvas.width = cw * dpr;
  canvas.height = cw * (H / W) * dpr;
  ctx.setTransform((cw * dpr) / W, 0, 0, (cw * dpr) / W, 0, 0);
  draw();
}

function reset() {
  bugY = H / 2; vy = 0; score = 0; scroll = 0;
  pillars = [];
  for (let i = 0; i < 3; i++) addPillar(W + 80 + i * SPACING);
  $("score").textContent = "0";
}

function addPillar(x) {
  const top = 60 + Math.random() * (GROUND - GAP - 120);
  pillars.push({ x, top, passed: false });
}

function flap() {
  if (state === "over") return;
  if (state === "ready") {
    reset();
    state = "running";
    $("msg").hidden = true;
    $("result").textContent = "";
    $("result").className = "result";
    $("again").hidden = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
  vy = FLAP;
}

function loop(now) {
  if (state !== "running") return;
  const dt = Math.min(0.03, (now - lastTime) / 1000);
  lastTime = now;

  vy += GRAVITY * dt;
  bugY += vy * dt;
  scroll = (scroll + SPEED * dt) % 40;

  pillars.forEach((p) => {
    p.x -= SPEED * dt;
    if (!p.passed && p.x + PILLAR_W < BUG_X - BUG_R) {
      p.passed = true;
      score++;
      $("score").textContent = score;
    }
  });
  if (pillars[0].x < -PILLAR_W) {
    pillars.shift();
    addPillar(pillars[pillars.length - 1].x + SPACING);
  }

  draw();
  if (crashed()) return gameOver();
  requestAnimationFrame(loop);
}

// círculo um pouco menor que o desenho, para a colisão parecer justa
function crashed() {
  const r = BUG_R - 3;
  if (bugY + r >= GROUND || bugY - r <= 0) return true;
  return pillars.some((p) => {
    const inX = BUG_X + r > p.x && BUG_X - r < p.x + PILLAR_W;
    return inX && (bugY - r < p.top || bugY + r > p.top + GAP);
  });
}

function gameOver() {
  state = "over";
  const record = score > best;
  best = saveRecord("voo", score);
  $("best").textContent = best;
  $("msgText").textContent = "💥 Bateu!";
  $("msg").hidden = false;
  $("result").textContent = `Você passou ${score} pilar${score === 1 ? "" : "es"}` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2a0508");
  sky.addColorStop(1, "#8f0b14");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  pillars.forEach((p) => {
    const g = ctx.createLinearGradient(p.x, 0, p.x + PILLAR_W, 0);
    g.addColorStop(0, "#ff9d00");
    g.addColorStop(0.5, "#ffe27a");
    g.addColorStop(1, "#c8861a");
    ctx.fillStyle = g;
    ctx.fillRect(p.x, 0, PILLAR_W, p.top);
    ctx.fillRect(p.x, p.top + GAP, PILLAR_W, GROUND - p.top - GAP);
    ctx.fillStyle = "#8a5a00";
    ctx.fillRect(p.x - 4, p.top - 14, PILLAR_W + 8, 14);
    ctx.fillRect(p.x - 4, p.top + GAP, PILLAR_W + 8, 14);
  });

  ctx.fillStyle = "#0b4a22";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "#ffd24a";
  ctx.fillRect(0, GROUND, W, 3);
  ctx.fillStyle = "rgba(255, 255, 255, .15)";
  for (let x = -scroll; x < W; x += 40) ctx.fillRect(x, GROUND + 12, 18, 4);

  ctx.save();
  ctx.translate(BUG_X, bugY);
  ctx.rotate(Math.max(-0.5, Math.min(1, vy / 600))); // inclina para baixo quando cai
  ctx.fillStyle = "#000"; // emoji usa a transparência da cor atual: precisa ser opaca
  ctx.font = `${BUG_R * 2.3}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🐞", 0, 2);
  ctx.restore();
}

function restart() {
  state = "ready";
  reset();
  $("msgText").textContent = "Toque ou aperte Espaço para voar";
  draw();
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    flap();
  }
});
$("arena").addEventListener("pointerdown", (e) => { e.preventDefault(); flap(); });
$("again").addEventListener("click", (e) => { e.currentTarget.blur(); restart(); });
window.addEventListener("resize", resize);

checkSession().then(() => {
  best = saveRecord("voo", 0);
  $("best").textContent = best;
  reset();
  resize();
});
