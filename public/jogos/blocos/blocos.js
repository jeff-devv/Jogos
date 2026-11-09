const $ = (id) => document.getElementById(id);
const grid = $("grid");
const SIZE = 4;
const GOAL = 2048;
const KEYS = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
};

let cells = [], score = 0, best = 0, won = false, over = false;

function start() {
  cells = new Array(SIZE * SIZE).fill(0);
  score = 0; won = false; over = false;
  $("score").textContent = "0";
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  addTile();
  addTile();
  render();
}

function addTile() {
  const empty = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return;
  cells[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
}

// casas de uma linha, na ordem em que os blocos andam
function line(i, d) {
  const idx = [];
  for (let j = 0; j < SIZE; j++) {
    if (d === "left") idx.push(i * SIZE + j);
    if (d === "right") idx.push(i * SIZE + SIZE - 1 - j);
    if (d === "up") idx.push(j * SIZE + i);
    if (d === "down") idx.push((SIZE - 1 - j) * SIZE + i);
  }
  return idx;
}

function move(d) {
  if (over) return;
  let moved = false;
  for (let i = 0; i < SIZE; i++) {
    const idx = line(i, d);
    const vals = idx.map((k) => cells[k]).filter((v) => v);
    const out = [];
    // cada bloco junta no máximo uma vez por jogada
    for (let k = 0; k < vals.length; k++) {
      if (vals[k] === vals[k + 1]) {
        out.push(vals[k] * 2);
        score += vals[k] * 2;
        k++;
      } else {
        out.push(vals[k]);
      }
    }
    while (out.length < SIZE) out.push(0);
    idx.forEach((k, j) => {
      if (cells[k] !== out[j]) moved = true;
      cells[k] = out[j];
    });
  }
  if (!moved) return;
  addTile();
  render();
  $("score").textContent = score;

  if (!won && cells.includes(GOAL)) {
    won = true;
    $("result").textContent = "🏆 Você chegou ao 2048! Continue para fazer mais pontos.";
    $("result").className = "result ok";
  }
  if (!canMove()) finish();
}

function canMove() {
  if (cells.includes(0)) return true;
  for (let i = 0; i < cells.length; i++) {
    const right = (i + 1) % SIZE !== 0 && cells[i] === cells[i + 1];
    const down = i + SIZE < cells.length && cells[i] === cells[i + SIZE];
    if (right || down) return true;
  }
  return false;
}

function finish() {
  over = true;
  const record = score > best;
  best = saveRecord("blocos", score);
  $("best").textContent = best;
  $("result").textContent = `Sem jogadas! Você fez ${score} pontos` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

function render() {
  grid.innerHTML = "";
  cells.forEach((v) => {
    const t = document.createElement("div");
    t.className = "tile";
    if (v) {
      t.textContent = v;
      t.dataset.v = v > GOAL ? "big" : v;
    }
    grid.appendChild(t);
  });
}

document.addEventListener("keydown", (e) => {
  if (KEYS[e.code]) {
    e.preventDefault();
    move(KEYS[e.code]);
  }
});

let touchStart = null;
grid.addEventListener("pointerdown", (e) => { touchStart = { x: e.clientX, y: e.clientY }; });
grid.addEventListener("pointerup", (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
});
$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("blocos", 0);
  $("best").textContent = best;
  start();
});
