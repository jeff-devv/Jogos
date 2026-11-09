const $ = (id) => document.getElementById(id);
const puzzleEl = $("puzzle");
const N = 3;
const SOLVED = [1, 2, 3, 4, 5, 6, 7, 8, 0]; // 0 = espaço vazio

let tiles = [], moves = 0, seconds = 0, timer = null, done = false, best = 0;

const adjacent = (a, b) => Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N)) === 1;

// embaralha fazendo jogadas válidas a partir do resolvido: assim sempre tem solução
function shuffle() {
  tiles = [...SOLVED];
  let empty = tiles.indexOf(0), prev = -1;
  for (let k = 0; k < 150; k++) {
    const options = tiles.map((_, i) => i).filter((i) => adjacent(i, empty) && i !== prev);
    const pick = options[Math.floor(Math.random() * options.length)];
    [tiles[empty], tiles[pick]] = [tiles[pick], tiles[empty]];
    prev = empty;
    empty = pick;
  }
  if (solved()) shuffle();
}

const solved = () => tiles.every((v, i) => v === SOLVED[i]);

function start() {
  clearInterval(timer);
  timer = null;
  moves = 0; seconds = 0; done = false;
  $("moves").textContent = "0";
  $("time").textContent = "0";
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  shuffle();
  render();
}

function slide(i) {
  const empty = tiles.indexOf(0);
  if (done || !adjacent(i, empty)) return;
  if (!timer) timer = setInterval(() => { seconds++; $("time").textContent = seconds; }, 1000);
  [tiles[empty], tiles[i]] = [tiles[i], tiles[empty]];
  moves++;
  $("moves").textContent = moves;
  render();
  if (solved()) finish();
}

function finish() {
  done = true;
  clearInterval(timer);
  best = saveRecord("deslize", best + 1); // conta os quebra-cabeças resolvidos
  $("best").textContent = best;
  puzzleEl.classList.add("solved");
  $("result").textContent = `🏆 Resolvido em ${moves} jogadas e ${seconds} segundos!`;
  $("result").className = "result ok";
  $("again").hidden = false;
}

function render() {
  puzzleEl.classList.remove("solved");
  puzzleEl.innerHTML = "";
  tiles.forEach((v, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "piece" + (v ? "" : " empty");
    b.textContent = v || "";
    b.disabled = !v;
    b.addEventListener("click", () => slide(i));
    puzzleEl.appendChild(b);
  });
}

$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("deslize", 0);
  $("best").textContent = best;
  start();
});
