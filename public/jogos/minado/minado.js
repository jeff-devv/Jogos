const $ = (id) => document.getElementById(id);
const field = $("field");
const ROWS = 9;
const COLS = 9;
const MINES = 10;

let cells = [], started = false, over = false, flagMode = false, opened = 0, flags = 0;
let seconds = 0, timer = null, best = 0;

function start() {
  clearInterval(timer);
  cells = [];
  started = false; over = false; opened = 0; flags = 0; seconds = 0;
  $("mines").textContent = MINES;
  $("time").textContent = "0";
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  field.innerHTML = "";
  for (let i = 0; i < ROWS * COLS; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.addEventListener("click", () => (flagMode ? toggleFlag(i) : reveal(i)));
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); toggleFlag(i); });
    cells.push({ mine: false, open: false, flag: false, n: 0, el: b });
    field.appendChild(b);
  }
}

function neighbors(i) {
  const r = Math.floor(i / COLS), c = i % COLS, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(rr * COLS + cc);
    }
  }
  return out;
}

// as minas só são sorteadas no primeiro clique, longe dele: a primeira jogada nunca perde
function placeMines(first) {
  const safe = new Set([first, ...neighbors(first)]);
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * cells.length);
    if (safe.has(i) || cells[i].mine) continue;
    cells[i].mine = true;
    placed++;
  }
  cells.forEach((c, i) => { c.n = neighbors(i).filter((k) => cells[k].mine).length; });
}

function reveal(i) {
  const cell = cells[i];
  if (over || cell.open || cell.flag) return;
  if (!started) {
    started = true;
    placeMines(i);
    timer = setInterval(() => { seconds++; $("time").textContent = seconds; }, 1000);
  }
  if (cell.mine) return lose(i);

  // abre em cadeia as casas sem minas em volta
  const stack = [i];
  while (stack.length) {
    const k = stack.pop();
    const c = cells[k];
    if (c.open || c.flag) continue;
    c.open = true;
    opened++;
    c.el.classList.add("open");
    if (c.n) {
      c.el.textContent = c.n;
      c.el.dataset.n = c.n;
    } else {
      neighbors(k).forEach((nk) => { if (!cells[nk].open) stack.push(nk); });
    }
  }
  if (opened === ROWS * COLS - MINES) win();
}

function toggleFlag(i) {
  const cell = cells[i];
  if (over || cell.open) return;
  cell.flag = !cell.flag;
  flags += cell.flag ? 1 : -1;
  cell.el.textContent = cell.flag ? "🚩" : "";
  $("mines").textContent = MINES - flags;
}

function showMines() {
  cells.forEach((c) => {
    if (c.mine) {
      c.el.textContent = "💣";
      c.el.classList.add("mine");
    }
  });
}

function lose(i) {
  over = true;
  clearInterval(timer);
  showMines();
  cells[i].el.classList.add("boom");
  $("result").textContent = "💥 Você pisou numa mina!";
  $("result").className = "result bad";
  $("again").hidden = false;
}

function win() {
  over = true;
  clearInterval(timer);
  cells.forEach((c) => { if (c.mine) c.el.textContent = "🚩"; });
  best = saveRecord("minado", best + 1); // conta as vitórias
  $("best").textContent = best;
  $("result").textContent = `🏆 Campo limpo em ${seconds} segundos!`;
  $("result").className = "result ok";
  $("again").hidden = false;
}

$("flagMode").addEventListener("click", () => {
  flagMode = !flagMode;
  $("flagMode").classList.toggle("on", flagMode);
  $("flagMode").textContent = "🚩 Marcar: " + (flagMode ? "ligado" : "desligado");
});
$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("minado", 0);
  $("best").textContent = best;
  start();
});
