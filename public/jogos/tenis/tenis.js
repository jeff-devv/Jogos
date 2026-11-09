const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// campo fixo de 480 x 300; só a escala muda com a tela
const W = 480, H = 300;
const PADDLE_W = 10, PADDLE_H = 64, BALL_R = 7;
const ME_X = 18, CPU_X = W - 18 - PADDLE_W;
const GOAL = 5;
const CPU_SPEED = 250;         // limite de velocidade do computador: é isso que deixa ele vencível

let state = "serve";           // serve | running | over
let meY = H / 2, cpuY = H / 2, ball = {}, speed = 0, me = 0, cpu = 0, best = 0;
let keys = { up: false, down: false }, lastTime = 0, serveDir = 1;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  canvas.width = cw * dpr;
  canvas.height = cw * (H / W) * dpr;
  ctx.setTransform((cw * dpr) / W, 0, 0, (cw * dpr) / W, 0, 0);
  draw();
}

function newMatch() {
  me = 0; cpu = 0;
  $("me").textContent = "0";
  $("cpu").textContent = "0";
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  resetBall();
}

function resetBall() {
  state = "serve";
  ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  $("msgText").textContent = "Toque ou aperte Espaço para sacar";
  $("msg").hidden = false;
  draw();
}

function serve() {
  if (state !== "serve") return;
  speed = 280;
  const angle = (Math.random() - 0.5) * 0.9;
  ball.vx = serveDir * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
  serveDir = -serveDir;
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

const clampY = (y) => Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, y));

// rebate com ângulo conforme a parte da raquete e acelera um pouco a cada toque
function bounce(paddleY, dir) {
  const offset = Math.max(-1, Math.min(1, (ball.y - paddleY) / (PADDLE_H / 2)));
  speed = Math.min(620, speed * 1.06);
  ball.vx = dir * speed * Math.cos(offset * 0.9);
  ball.vy = speed * Math.sin(offset * 0.9);
}

function update(dt) {
  if (keys.up) meY -= 360 * dt;
  if (keys.down) meY += 360 * dt;
  meY = clampY(meY);

  // o computador só persegue a bola quando ela vem na direção dele
  const target = ball.vx > 0 ? ball.y : H / 2;
  const step = CPU_SPEED * dt;
  cpuY = clampY(cpuY + Math.max(-step, Math.min(step, target - cpuY)));

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.y < BALL_R || ball.y > H - BALL_R) {
    ball.vy = -ball.vy;
    ball.y = Math.max(BALL_R, Math.min(H - BALL_R, ball.y));
  }

  if (ball.vx < 0 && ball.x - BALL_R <= ME_X + PADDLE_W && ball.x > ME_X &&
      Math.abs(ball.y - meY) <= PADDLE_H / 2 + BALL_R) {
    ball.x = ME_X + PADDLE_W + BALL_R;
    bounce(meY, 1);
  }
  if (ball.vx > 0 && ball.x + BALL_R >= CPU_X && ball.x < CPU_X + PADDLE_W &&
      Math.abs(ball.y - cpuY) <= PADDLE_H / 2 + BALL_R) {
    ball.x = CPU_X - BALL_R;
    bounce(cpuY, -1);
  }

  if (ball.x < -BALL_R) point("cpu");
  else if (ball.x > W + BALL_R) point("me");
}

function point(who) {
  if (who === "me") me++;
  else cpu++;
  $("me").textContent = me;
  $("cpu").textContent = cpu;
  if (me < GOAL && cpu < GOAL) return resetBall();

  state = "over";
  const won = me > cpu;
  if (won) {
    best = saveRecord("tenis", best + 1); // conta as partidas vencidas
    $("best").textContent = best;
  }
  $("msgText").textContent = won ? "🏆 Você venceu!" : "O computador venceu";
  $("msg").hidden = false;
  $("result").textContent = `Placar final: ${me} × ${cpu}`;
  $("result").className = "result " + (won ? "ok" : "bad");
  $("again").hidden = false;
}

function draw() {
  ctx.fillStyle = "#0b4a22";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255, 255, 255, .25)";
  for (let y = 6; y < H; y += 22) ctx.fillRect(W / 2 - 1, y, 2, 12);
  ctx.strokeStyle = "rgba(255, 255, 255, .35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.roundRect(ME_X, meY - PADDLE_H / 2, PADDLE_W, PADDLE_H, 4);
  ctx.fill();
  ctx.fillStyle = "#ff7a85";
  ctx.beginPath();
  ctx.roundRect(CPU_X, cpuY - PADDLE_H / 2, PADDLE_W, PADDLE_H, 4);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

function pointerToPaddle(e) {
  const rect = canvas.getBoundingClientRect();
  meY = clampY(((e.clientY - rect.top) / rect.height) * H);
  if (state !== "running") draw();
}

const arena = $("arena");
arena.addEventListener("pointermove", pointerToPaddle);
arena.addEventListener("pointerdown", (e) => { pointerToPaddle(e); serve(); });

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.up = true;
  else if (e.code === "ArrowDown" || e.code === "KeyS") keys.down = true;
  else if (e.code === "Space") serve();
  else return;
  e.preventDefault();
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowUp" || e.code === "KeyW") keys.up = false;
  if (e.code === "ArrowDown" || e.code === "KeyS") keys.down = false;
});
$("again").addEventListener("click", (e) => { e.currentTarget.blur(); newMatch(); });
window.addEventListener("resize", resize);

checkSession().then(() => {
  best = saveRecord("tenis", 0);
  $("best").textContent = best;
  resize();
  newMatch();
});
