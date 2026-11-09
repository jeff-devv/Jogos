const $ = (id) => document.getElementById(id);
const holesEl = $("holes");
const HOLES = 9;
const DURATION = 30;
const BOMB_CHANCE = 0.18;
const BOMB_PENALTY = 3;

let holes = [], score = 0, best = 0, timeLeft = 0, playing = false, clock = null, spawner = null;

function build() {
  holesEl.innerHTML = "";
  holes = [];
  for (let i = 0; i < HOLES; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hole";
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); hit(i); });
    holesEl.appendChild(b);
    holes.push({ el: b, kind: "", hide: null });
  }
}

function start() {
  score = 0;
  timeLeft = DURATION;
  playing = true;
  $("score").textContent = "0";
  $("time").textContent = timeLeft;
  $("result").textContent = "";
  $("result").className = "result";
  $("startBtn").hidden = true;
  $("again").hidden = true;
  holes.forEach((_, i) => clear(i));
  clock = setInterval(() => {
    timeLeft--;
    $("time").textContent = timeLeft;
    if (timeLeft <= 0) finish();
  }, 1000);
  spawn();
}

// aparecem mais rápido e ficam menos tempo conforme o relógio corre
function spawn() {
  if (!playing) return;
  const free = holes.map((h, i) => (h.kind ? -1 : i)).filter((i) => i >= 0);
  if (free.length) {
    const i = free[Math.floor(Math.random() * free.length)];
    const h = holes[i];
    h.kind = Math.random() < BOMB_CHANCE ? "bomb" : "mole";
    h.el.textContent = h.kind === "bomb" ? "💣" : "🐹";
    h.el.classList.add("up");
    const stay = 600 + (timeLeft / DURATION) * 600;
    h.hide = setTimeout(() => clear(i), stay);
  }
  spawner = setTimeout(spawn, 380 + (timeLeft / DURATION) * 420);
}

function clear(i) {
  const h = holes[i];
  clearTimeout(h.hide);
  h.kind = "";
  h.el.textContent = "";
  h.el.classList.remove("up", "hit", "bad");
}

function hit(i) {
  const h = holes[i];
  if (!playing || !h.kind || h.el.classList.contains("hit") || h.el.classList.contains("bad")) return;
  if (h.kind === "bomb") {
    score = Math.max(0, score - BOMB_PENALTY);
    h.el.textContent = "💥";
    h.el.classList.add("bad");
  } else {
    score++;
    h.el.textContent = "⭐";
    h.el.classList.add("hit");
  }
  $("score").textContent = score;
  clearTimeout(h.hide);
  h.hide = setTimeout(() => clear(i), 250);
}

function finish() {
  playing = false;
  clearInterval(clock);
  clearTimeout(spawner);
  holes.forEach((_, i) => clear(i));
  const record = score > best;
  best = saveRecord("toupeira", score);
  $("best").textContent = best;
  $("result").textContent = `Tempo esgotado! Você fez ${score} pontos` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

$("startBtn").addEventListener("click", start);
$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("toupeira", 0);
  $("best").textContent = best;
  build();
});
