const $ = (id) => document.getElementById(id);
const API = "../../api/";
const TOKEN_KEY = "slot_token";
const SPIN_MS = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1200 : 5000;
const HISTORY_SIZE = 12;

let token = localStorage.getItem(TOKEN_KEY);
let rules = null;          // vem do roulette_info.php (fonte única: roulette_rules.php)
let balance = 0;           // centavos
let spinning = false;
let wheelAngle = 0;
const bets = new Map();    // "type:target" -> { type, target, amount, el }
const history = [];

const fmt = (c) => (Number(c) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colorOf = (n) => (n === 0 ? "green" : rules.red.includes(n) ? "red" : "black");

function setMsg(text, err = false) {
  $("msg").textContent = text;
  $("msg").className = "msg" + (err ? " err" : "");
}

async function api(path, body = {}) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Erro " + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

function goLogin() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "../../index.html";
}

// "5", "5,50", "1.000,00" ou "5.5" -> centavos (NaN se inválido)
function parseAmount(text) {
  let s = String(text).trim().replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

// ---------------- roda (SVG) ----------------
const point = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
};
const sector = (r1, r2, a0, a1) =>
  `M${point(r2, a0)} A${r2} ${r2} 0 0 1 ${point(r2, a1)} L${point(r1, a1)} A${r1} ${r1} 0 0 0 ${point(r1, a0)} Z`;

function drawWheel() {
  const step = 360 / rules.wheel.length;
  const fill = { red: "#c8102e", black: "#161616", green: "#0a7a2f" };
  const pocket = { red: "#8e0a20", black: "#0a0a0a", green: "#065a22" };
  let svg = `<defs><radialGradient id="hub"><stop offset="0" stop-color="#ffe27a"/><stop offset=".6" stop-color="#b8770a"/>
    <stop offset="1" stop-color="#5a3500"/></radialGradient></defs>
    <circle r="100" fill="#3a1c06"/>`;
  rules.wheel.forEach((n, i) => {
    const a0 = i * step - step / 2, a1 = a0 + step, c = colorOf(n);
    svg += `<path d="${sector(74, 98, a0, a1)}" fill="${fill[c]}" stroke="#d9a520" stroke-width=".6"/>`;
    svg += `<path d="${sector(58, 74, a0, a1)}" fill="${pocket[c]}" stroke="#d9a520" stroke-width=".6"/>`;
    svg += `<text transform="rotate(${i * step}) translate(0 -83)" dy="2.5">${n}</text>`;
  });
  svg += `<circle r="58" fill="url(#hub)"/><circle r="20" fill="#5a3500" stroke="#ffe27a" stroke-width="1.5"/>`;
  $("wheel").innerHTML = svg;
}

// Gira a roda até a casa sorteada parar no topo; a bolinha corre ao contrário e cai nela.
function spinTo(number) {
  const step = 360 / rules.wheel.length;
  const idx = rules.wheel.indexOf(number);
  const delta = (((-idx * step - wheelAngle) % 360) + 360) % 360;
  wheelAngle += 5 * 360 + delta;

  const wheel = $("wheel"), orbit = $("ballOrbit"), ball = $("ball");
  orbit.style.transition = "none";
  ball.style.transition = "none";
  orbit.style.transform = "rotate(0deg)";
  ball.style.top = "4%";
  void orbit.offsetWidth; // aplica a posição inicial antes de animar

  const s = SPIN_MS / 1000;
  wheel.style.transition = `transform ${s}s cubic-bezier(.12,.6,.2,1)`;
  orbit.style.transition = `transform ${s}s cubic-bezier(.1,.55,.25,1)`;
  ball.style.transition = `top ${s * 0.25}s cubic-bezier(.5,0,.8,.4) ${s * 0.68}s`;
  wheel.style.transform = `rotate(${wheelAngle}deg)`;
  orbit.style.transform = "rotate(-2160deg)";
  ball.style.top = "14.7%";
  return new Promise((resolve) => setTimeout(resolve, SPIN_MS + 150));
}

// ---------------- tabuleiro ----------------
const keyOf = (type, target) => type + ":" + (target ?? "");

function addCell(type, target, label, area, cls = "") {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "cell " + cls;
  el.textContent = label;
  el.style.gridArea = area;
  el.dataset.key = keyOf(type, target);
  el.addEventListener("click", () => {
    if (el.dataset.longpress) { delete el.dataset.longpress; return; }
    placeBet(type, target, el);
  });
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); removeBet(el.dataset.key); });
  // celular: segurar o dedo tira a aposta
  let timer;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    timer = setTimeout(() => { el.dataset.longpress = "1"; removeBet(el.dataset.key); }, 550);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, () => clearTimeout(timer)));
  $("table").appendChild(el);
}

// grid: coluna 1 = zero, 2..13 = números, 14 = colunas "2:1"; linhas 4 e 5 = dúzias e apostas externas
function buildTable() {
  addCell("number", 0, "0", "1 / 1 / 4 / 2", "green");
  for (let n = 1; n <= 36; n++) {
    const col = 2 + Math.floor((n - 1) / 3), row = 3 - ((n - 1) % 3);
    addCell("number", n, String(n), `${row} / ${col}`, colorOf(n));
  }
  [3, 2, 1].forEach((c, i) => addCell("column", c, "2:1", `${i + 1} / 14`, "out"));
  ["1ª DÚZIA", "2ª DÚZIA", "3ª DÚZIA"].forEach((t, i) => addCell("dozen", i + 1, t, `4 / ${2 + i * 4} / 5 / ${6 + i * 4}`, "out"));
  [
    ["low", "1 a 18", ""], ["even", "PAR", ""], ["red", "VERMELHO", "red"],
    ["black", "PRETO", "black"], ["odd", "ÍMPAR", ""], ["high", "19 a 36", ""],
  ].forEach(([type, label, c], i) => addCell(type, null, label, `5 / ${2 + i * 2} / 6 / ${4 + i * 2}`, "out " + c));
}

const totalStaked = () => [...bets.values()].reduce((s, b) => s + b.amount, 0);

function paintBet(b) {
  let chip = b.el.querySelector(".chip");
  if (!chip) { chip = document.createElement("span"); chip.className = "chip"; b.el.appendChild(chip); }
  chip.textContent = fmt(b.amount);
}

function refreshTotals() {
  $("staked").textContent = fmt(totalStaked());
  $("balance").textContent = fmt(balance);
}

function clearMarks() {
  document.querySelectorAll(".cell.drawn, .cell.hit").forEach((el) => el.classList.remove("drawn", "hit"));
}

function placeBet(type, target, el) {
  if (spinning) return;
  const amount = parseAmount($("amount").value);
  if (!Number.isFinite(amount) || amount < rules.minBet) {
    return setMsg("Digite um valor válido (mínimo " + fmt(rules.minBet) + ").", true);
  }
  const key = keyOf(type, target);
  if (!bets.has(key) && bets.size >= rules.maxBets) return setMsg("Limite de casas por rodada atingido.", true);
  const total = totalStaked() + amount;
  if (total > rules.maxTotal) return setMsg("O total da rodada passa do limite de " + fmt(rules.maxTotal) + ".", true);
  if (total > balance) return setMsg("Saldo insuficiente para essa aposta.", true);

  clearMarks();
  const b = bets.get(key) || { type, target, amount: 0, el };
  b.amount += amount;
  bets.set(key, b);
  paintBet(b);
  refreshTotals();
  setMsg("");
}

function removeBet(key) {
  if (spinning || !bets.has(key)) return;
  bets.get(key).el.querySelector(".chip")?.remove();
  bets.delete(key);
  refreshTotals();
}

function clearBets() {
  if (spinning) return;
  [...bets.keys()].forEach(removeBet);
  clearMarks();
  setMsg("");
}

// ---------------- rodada ----------------
function pushHistory(n) {
  history.unshift(n);
  history.length = Math.min(history.length, HISTORY_SIZE);
  $("history").innerHTML = "";
  history.forEach((x) => {
    const chip = document.createElement("span");
    chip.className = "num " + colorOf(x);
    chip.textContent = x;
    $("history").appendChild(chip);
  });
}

function setLocked(on) {
  spinning = on;
  $("spin").disabled = on;
  $("clear").disabled = on;
  document.querySelectorAll(".cell").forEach((el) => { el.disabled = on; });
}

async function spin() {
  if (spinning) return;
  if (bets.size === 0) return setMsg("Escolha pelo menos uma casa no tabuleiro.", true);

  const list = [...bets.values()];
  setLocked(true);
  clearMarks();
  setMsg("");
  $("result").className = "result";
  $("result").textContent = "Girando...";
  $("prize").textContent = fmt(0);

  let res;
  try {
    res = await api("roulette.php", { bets: list.map((b) => ({ type: b.type, target: b.target, amount: b.amount })) });
  } catch (e) {
    setLocked(false);
    $("result").textContent = "Faça suas apostas";
    if (e.status === 401) return goLogin();
    return setMsg(e.message, true);
  }

  await spinTo(res.number);

  balance = res.balance;
  refreshTotals();
  pushHistory(res.number);
  document.querySelector(`.cell[data-key="number:${res.number}"]`).classList.add("drawn");
  res.winningBets.forEach((i) => list[i].el.classList.add("hit"));

  const name = { red: "VERMELHO", black: "PRETO", green: "VERDE" }[res.color];
  $("result").textContent = res.win > 0
    ? `${res.number} ${name} · você ganhou ${fmt(res.win)}!`
    : `${res.number} ${name} · não foi dessa vez`;
  $("result").className = "result" + (res.win > 0 ? " win" : "");
  $("prize").textContent = fmt(res.win);
  setLocked(false);
  // as fichas continuam no tabuleiro para repetir a aposta; LIMPAR tira todas
}

// ---------------- início ----------------
(async function init() {
  if (!token) return goLogin();
  try {
    rules = await api("roulette_info.php");
  } catch (e) {
    if (e.status === 401) return goLogin();
    return setMsg(e.message, true);
  }
  $("hUser").textContent = rules.username;
  balance = rules.balance;
  drawWheel();
  buildTable();
  refreshTotals();
  $("spin").addEventListener("click", spin);
  $("clear").addEventListener("click", clearBets);
})();
