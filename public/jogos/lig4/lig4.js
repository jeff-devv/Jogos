const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const ROWS = 6;
const COLS = 7;
const ME = 1, CPU = 2;

let board = [], over = false, busy = false, cpuStarts = false;
const score = { wins: 0, draws: 0, losses: 0 };

function start() {
  board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  over = false;
  busy = false;
  $("result").textContent = cpuStarts ? "O computador começa." : "Sua vez: escolha uma coluna.";
  $("result").className = "result";
  $("again").hidden = true;
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.addEventListener("click", () => play(c));
      boardEl.appendChild(b);
    }
  }
  if (cpuStarts) {
    busy = true;
    setTimeout(cpuMove, 500);
  }
  cpuStarts = !cpuStarts; // quem começa alterna a cada partida
}

const cellEl = (r, c) => boardEl.children[r * COLS + c];

// linha onde a ficha para ao cair na coluna (-1 = coluna cheia)
function dropRow(c) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[r][c]) return r;
  return -1;
}

function drop(c, who) {
  const r = dropRow(c);
  board[r][c] = who;
  cellEl(r, c).classList.add(who === ME ? "me" : "cpu");
  return r;
}

// quatro iguais a partir de (r, c) em qualquer direção; devolve as casas da linha
function fourAt(r, c) {
  const who = board[r][c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[rr][cc] === who) {
        line.push([rr, cc]);
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function play(c) {
  if (over || busy || dropRow(c) < 0) return;
  const r = drop(c, ME);
  if (check(r, c)) return;
  busy = true;
  $("result").textContent = "O computador está pensando...";
  setTimeout(cpuMove, 450);
}

// testa uma jogada sem deixar marca no tabuleiro
function wouldWin(c, who) {
  const r = dropRow(c);
  if (r < 0) return false;
  board[r][c] = who;
  const win = !!fourAt(r, c);
  board[r][c] = 0;
  return win;
}

// ganha se puder, bloqueia se precisar, evita dar a vitória de bandeja e prefere o centro
function cpuMove() {
  const free = [...Array(COLS).keys()].filter((c) => dropRow(c) >= 0);
  let c = free.find((k) => wouldWin(k, CPU));
  if (c === undefined) c = free.find((k) => wouldWin(k, ME));
  if (c === undefined) {
    const safe = free.filter((k) => {
      const r = dropRow(k);
      if (r === 0) return true;
      board[r][k] = CPU;
      const givesWin = wouldWin(k, ME);
      board[r][k] = 0;
      return !givesWin;
    });
    const options = safe.length ? safe : free;
    // peso maior para as colunas do meio, com um pouco de sorte
    c = options.reduce((bestCol, k) => {
      const w = (4 - Math.abs(3 - k)) + Math.random() * 2.5;
      return w > bestCol.w ? { k, w } : bestCol;
    }, { k: options[0], w: -1 }).k;
  }
  const r = drop(c, CPU);
  busy = false;
  if (!check(r, c)) $("result").textContent = "Sua vez: escolha uma coluna.";
}

function check(r, c) {
  const line = fourAt(r, c);
  const full = board[0].every((v) => v);
  if (!line && !full) return false;
  over = true;
  if (line) {
    line.forEach(([rr, cc]) => cellEl(rr, cc).classList.add("win"));
    const meWon = board[r][c] === ME;
    score[meWon ? "wins" : "losses"]++;
    $("result").textContent = meWon ? "🏆 Você fez quatro em linha!" : "O computador fez quatro em linha.";
    $("result").className = "result " + (meWon ? "ok" : "bad");
  } else {
    score.draws++;
    $("result").textContent = "Tabuleiro cheio: empate!";
  }
  $("wins").textContent = score.wins;
  $("draws").textContent = score.draws;
  $("losses").textContent = score.losses;
  $("again").hidden = false;
  return true;
}

$("again").addEventListener("click", start);

checkSession().then(start);
