const ICONS = ["🍎", "🍌", "🍇", "🍓", "🍒", "🍑", "🥝", "🍍"];
const board = document.getElementById("board");
const movesEl = document.getElementById("moves");
const pairsEl = document.getElementById("pairs");
const resultEl = document.getElementById("result");
const againBtn = document.getElementById("again");

let first = null, lock = false, moves = 0, found = 0;

checkSession(); // sessao.js: mostra o usuário (ou "Visitante")

function start() {
  const deck = [...ICONS, ...ICONS].sort(() => Math.random() - 0.5);
  board.innerHTML = "";
  moves = 0; found = 0; first = null; lock = false;
  movesEl.textContent = "0";
  pairsEl.textContent = "0";
  resultEl.textContent = "";
  againBtn.hidden = true;

  deck.forEach((icon) => {
    const t = document.createElement("button");
    t.className = "tile";
    t.dataset.icon = icon;
    t.textContent = "?";
    t.onclick = () => flip(t);
    board.appendChild(t);
  });
}

function flip(t) {
  if (lock || t.classList.contains("open") || t.classList.contains("done")) return;
  t.classList.add("open");
  t.textContent = t.dataset.icon;

  if (!first) { first = t; return; }

  moves++;
  movesEl.textContent = moves;

  if (first.dataset.icon === t.dataset.icon) {
    first.classList.replace("open", "done");
    t.classList.replace("open", "done");
    first = null;
    found++;
    pairsEl.textContent = found;
    if (found === ICONS.length) finish();
  } else {
    lock = true;
    const a = first, b = t;
    setTimeout(() => {
      a.classList.remove("open"); a.textContent = "?";
      b.classList.remove("open"); b.textContent = "?";
      first = null; lock = false;
    }, 700);
  }
}

function finish() {
  resultEl.textContent = `Você terminou em ${moves} jogadas!`;
  againBtn.hidden = false;
}

againBtn.onclick = start;
start();
