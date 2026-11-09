const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

let board = [], over = false, busy = false, cpuStarts = false;
const score = { wins: 0, draws: 0, losses: 0 };

function start() {
  board = new Array(9).fill("");
  over = false;
  busy = false;
  $("result").textContent = cpuStarts ? "O computador começa." : "Sua vez.";
  $("result").className = "result";
  $("again").hidden = true;
  boardEl.innerHTML = "";
  board.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "square";
    b.addEventListener("click", () => play(i));
    boardEl.appendChild(b);
  });
  if (cpuStarts) {
    busy = true;
    setTimeout(cpuMove, 500);
  }
  cpuStarts = !cpuStarts; // quem começa alterna a cada partida
}

function mark(i, who) {
  board[i] = who;
  const b = boardEl.children[i];
  b.textContent = who;
  b.classList.add(who === "X" ? "x" : "o");
}

function play(i) {
  if (over || busy || board[i]) return;
  mark(i, "X");
  if (check()) return;
  busy = true;
  $("result").textContent = "O computador está pensando...";
  setTimeout(cpuMove, 450);
}

// casa que completa uma linha de "who", se existir
function finishing(who) {
  for (const l of LINES) {
    const vals = l.map((i) => board[i]);
    if (vals.filter((v) => v === who).length === 2 && vals.includes("")) return l[vals.indexOf("")];
  }
  return -1;
}

// o computador ganha se puder, bloqueia se precisar e às vezes erra de propósito para dar chance
function cpuMove() {
  const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const pickFrom = (list) => list[Math.floor(Math.random() * list.length)];
  let i = finishing("O");
  if (i < 0 && Math.random() < 0.85) i = finishing("X");
  if (i < 0 && !board[4]) i = 4;
  if (i < 0) {
    const corners = [0, 2, 6, 8].filter((k) => !board[k]);
    i = corners.length ? pickFrom(corners) : pickFrom(free);
  }
  mark(i, "O");
  busy = false;
  if (!check()) $("result").textContent = "Sua vez.";
}

function check() {
  const line = LINES.find((l) => board[l[0]] && l.every((i) => board[i] === board[l[0]]));
  if (!line && board.includes("")) return false;
  over = true;
  if (line) {
    line.forEach((i) => boardEl.children[i].classList.add("win"));
    const meWon = board[line[0]] === "X";
    score[meWon ? "wins" : "losses"]++;
    $("result").textContent = meWon ? "🏆 Você venceu!" : "O computador venceu.";
    $("result").className = "result " + (meWon ? "ok" : "bad");
  } else {
    score.draws++;
    $("result").textContent = "Deu velha! Empate.";
  }
  $("wins").textContent = score.wins;
  $("draws").textContent = score.draws;
  $("losses").textContent = score.losses;
  $("again").hidden = false;
  return true;
}

$("again").addEventListener("click", start);

checkSession().then(start);
