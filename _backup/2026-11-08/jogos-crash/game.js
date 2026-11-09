// Lógica do jogo (roda SOMENTE no servidor). Créditos fictícios.
const crypto = require("crypto");

const SYMBOLS = [
  { id: "cherry",  icon: "🍊", weight: 40, pay: 6 },
  { id: "lemon",   icon: "🧧", weight: 30, pay: 10 },
  { id: "bell",    icon: "🏮", weight: 18, pay: 30 },
  { id: "diamond", icon: "💰", weight: 8,  pay: 100 },
  { id: "star",    icon: "🐯", weight: 4,  pay: 500 },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);
const ROWS = 3, REELS = 3;
const BETS = [1, 5, 10, 50];

function pickSymbol() {
  let r = crypto.randomInt(TOTAL_WEIGHT);
  for (const s of SYMBOLS) {
    if (r < s.weight) return s;
    r -= s.weight;
  }
  return SYMBOLS[0];
}

function spin(bet) {
  const grid = [];
  for (let row = 0; row < ROWS; row++) {
    const line = [];
    for (let reel = 0; reel < REELS; reel++) line.push(pickSymbol());
    grid.push(line);
  }
  const lineBet = bet / ROWS;
  let win = 0;
  const winningLines = [];
  grid.forEach((line, i) => {
    if (line.every((s) => s.id === line[0].id)) {
      win += lineBet * line[0].pay;
      winningLines.push(i);
    }
  });
  return {
    grid: grid.map((l) => l.map((s) => s.icon)),
    win: Math.round(win * 100) / 100,
    winningLines,
  };
}

function theoreticalRTP() {
  return SYMBOLS.reduce((sum, s) => sum + Math.pow(s.weight / TOTAL_WEIGHT, 3) * s.pay, 0);
}

module.exports = { SYMBOLS, BETS, spin, theoreticalRTP };
