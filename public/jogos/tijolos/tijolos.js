const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// tudo é calculado num campo fixo de 480 x 360 e só a escala muda com a tela
const W = 480, H = 360;
const ROWS = 6, COLS = 8, GAP = 6, TOP = 36, BRICK_H = 16;
const BRICK_W = (W - GAP * (COLS + 1)) / COLS;
const COLORS = ["#ff4d5a", "#ff6a00", "#ff9d00", "#ffd24a", "#67f27a", "#5ac8ff"];
const PADDLE_W = 84, PADDLE_H = 12, PADDLE_Y = H - 26, BALL_R = 7;
const START_SPEED = 300;

let state = "ready";           // ready (bola na raquete) | running | over
let paddleX = W / 2, ball = {}, speed = START_SPEED, bricks = [], score = 0, lives = 3, best = 0;
let keys = { left: false, right: false }, lastTime = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  canvas.width = cw * dpr;
  canvas.height = cw * (H / W) * dpr;
  ctx.setTransform((cw * dpr) / W, 0, 0, (cw * dpr) / W, 0, 0);
  draw();
}

function buildBricks() {
  bricks = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      bricks.push({ x: GAP + c * (BRICK_W + GAP), y: TOP + r * (BRICK_H + GAP), r, alive: true });
    }
  }
}

function newGame() {
  score = 0; lives = 3; speed = START_SPEED;
  $("score").textContent = "0";
  $("lives").textContent = "3";
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  buildBricks();
  serve();
}

// bola parada em cima da raquete, esperando o lançamento
function serve() {
  state = "ready";
  ball = { x: paddleX, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0 };
  $("msgText").textContent = "Toque ou aperte Espaço para lançar a bola";
  $("msg").hidden = false;
  draw();
}

function launch() {
  if (state !== "ready") return;
  const angle = (Math.random() - 0.5) * 0.8;
  ball.vx = speed * Math.sin(angle);
  ball.vy = -speed * Math.cos(angle);
  state = "running";
  $("msg").hidden = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  if (state !== "running") return;
  const dt = Math.min(0.03, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  if (state === "running") requestAnimationFrame(loop);
}

function update(dt) {
  if (keys.left) paddleX -= 420 * dt;
  if (keys.right) paddleX += 420 * dt;
  paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, paddleX));

  const prevX = ball.x, prevY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.x < BALL_R || ball.x > W - BALL_R) {
    ball.vx = -ball.vx;
    ball.x = Math.max(BALL_R, Math.min(W - BALL_R, ball.x));
  }
  if (ball.y < BALL_R) {
    ball.vy = Math.abs(ball.vy);
    ball.y = BALL_R;
  }

  // raquete: o ângulo depende de onde a bola bate (ponta = mais inclinado)
  const top = PADDLE_Y;
  if (ball.vy > 0 && ball.y + BALL_R >= top && prevY + BALL_R <= top + 4 &&
      Math.abs(ball.x - paddleX) <= PADDLE_W / 2 + BALL_R) {
    const offset = (ball.x - paddleX) / (PADDLE_W / 2);
    const angle = Math.max(-1, Math.min(1, offset)) * 1.05;
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle);
    ball.y = top - BALL_R;
  }

  for (const b of bricks) {
    if (!b.alive) continue;
    const hit = ball.x + BALL_R > b.x && ball.x - BALL_R < b.x + BRICK_W &&
                ball.y + BALL_R > b.y && ball.y - BALL_R < b.y + BRICK_H;
    if (!hit) continue;
    b.alive = false;
    score += (ROWS - b.r) * 10; // fileiras de cima valem mais
    $("score").textContent = score;
    // se antes estava ao lado do tijolo, bateu na lateral; senão, em cima ou embaixo
    const fromSide = prevX + BALL_R <= b.x || prevX - BALL_R >= b.x + BRICK_W;
    if (fromSide) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;
    break;
  }

  if (bricks.every((b) => !b.alive)) {
    speed *= 1.12; // fase nova, bola mais rápida
    buildBricks();
    serve();
    $("msgText").textContent = "⭐ Fase limpa! Toque para continuar";
    return;
  }

  if (ball.y - BALL_R > H) {
    lives--;
    $("lives").textContent = lives;
    if (lives <= 0) return gameOver();
    serve();
  }
}

function gameOver() {
  state = "over";
  const record = score > best;
  best = saveRecord("tijolos", score);
  $("best").textContent = best;
  $("msgText").textContent = "Fim de jogo!";
  $("msg").hidden = false;
  $("result").textContent = `Você fez ${score} pontos` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

function draw() {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a0508");
  bg.addColorStop(1, "#5e0710");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  bricks.forEach((b) => {
    if (!b.alive) return;
    ctx.fillStyle = COLORS[b.r];
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 4);
    ctx.fill();
  });

  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.roundRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H, 6);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(state === "ready" ? paddleX : ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

function pointerToPaddle(e) {
  const rect = canvas.getBoundingClientRect();
  paddleX = ((e.clientX - rect.left) / rect.width) * W;
  paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, paddleX));
  if (state === "ready") {
    ball.x = paddleX;
    draw();
  }
}

const arena = $("arena");
arena.addEventListener("pointermove", pointerToPaddle);
arena.addEventListener("pointerdown", (e) => { pointerToPaddle(e); launch(); });

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  else if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;
  else if (e.code !== "Space") return;
  e.preventDefault();
  launch(); // com teclado, qualquer tecla do jogo lança a bola parada
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});
$("again").addEventListener("click", (e) => { e.currentTarget.blur(); newGame(); });
window.addEventListener("resize", resize);

checkSession().then(() => {
  best = saveRecord("tijolos", 0);
  $("best").textContent = best;
  resize();
  newGame();
});
