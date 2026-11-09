const $ = (id) => document.getElementById(id);
const cellH = () => document.querySelector(".reel").clientHeight / 3;
let token = localStorage.getItem("slot_token");
let balance = 0, bets = [10], betIdx = 0, symbols = [];
let spinning = false, turbo = false, auto = false, soundOn = true;
const fmt = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function api(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({ token, ...(body || {}) }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Erro " + r.status);
  return data;
}

// ---- som ----
let ac;
function beep(freq, dur = 0.1, type = "sine") {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  } catch (e) {}
}

// ---- rolos ----
function randIcon() { return symbols[Math.floor(Math.random() * symbols.length)].icon; }
function setStrip(i, icons) {
  $("strip" + i).innerHTML = icons.map((c) => `<div class="cell">${c}</div>`).join("");
  $("strip" + i).style.transition = "none";
  $("strip" + i).style.transform = "translateY(0)";
}
function initReels() { for (let i = 0; i < 3; i++) setStrip(i, [randIcon(), randIcon(), randIcon()]); }

function animateReel(i, finalCol, ms) {
  return new Promise((resolve) => {
    const strip = $("strip" + i);
    const filler = 14 + i * 6;
    const icons = [];
    for (let k = 0; k < filler; k++) icons.push(randIcon());
    icons.push(...finalCol); // últimas 3 células = resultado
    strip.innerHTML = icons.map((c) => `<div class="cell">${c}</div>`).join("");
    const total = (icons.length - 3) * cellH();
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    void strip.offsetHeight;
    strip.style.transition = `transform ${ms + i * (ms / 4)}ms cubic-bezier(.15,.7,.2,1)`;
    strip.classList.add("blur");
    strip.style.transform = `translateY(-${total}px)`;
    setTimeout(() => strip.classList.remove("blur"), ms + i * (ms / 4) - 250);
    setTimeout(() => { beep(300 + i * 80, 0.08, "square"); resolve(); }, ms + i * (ms / 4) + 30);
  });
}

function bump(id) { const e = $(id); e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump"); }
function showMsg(t) { $("msg").textContent = t; }

async function doSpin() {
  if (spinning) return false;
  const bet = bets[betIdx];
  if (balance < bet) { showMsg("Saldo insuficiente. Clique em Reiniciar saldo."); auto = false; $("auto").classList.remove("on"); return false; }
  spinning = true; $("spin").disabled = true; $("cabinet").classList.remove("winning"); $("cabinet").classList.add("spinning"); showMsg(""); $("win").textContent = fmt(0);
  document.querySelectorAll(".cell.win").forEach((c) => c.classList.remove("win"));
  let res;
  try {
    res = await api("/api/spin", "POST", { bet });
  } catch (e) {
    showMsg(e.message); spinning = false; $("spin").disabled = false; auto = false; $("auto").classList.remove("on");
    if (/Sess/.test(e.message)) { localStorage.removeItem("slot_token"); token = null; await start(); }
    return false;
  }
  balance = res.balance - res.win; $("balance").textContent = fmt(balance);
  beep(500, 0.05);
  const ms = turbo ? 500 : 1400;
  const cols = [0, 1, 2].map((c) => res.grid.map((row) => row[c]));
  await Promise.all(cols.map((col, i) => animateReel(i, col, ms)));
  balance = res.balance; $("balance").textContent = fmt(balance);
  if (res.win > 0) {
    $("win").textContent = fmt(res.win); bump("win"); bump("balance"); $("cabinet").classList.add("winning");
    res.winningLines.forEach((r) => [0, 1, 2].forEach((c) => $("strip" + c).children[$("strip" + c).children.length - 3 + r].classList.add("win")));
    [600, 800, 1000].forEach((f, k) => setTimeout(() => beep(f, 0.12), k * 110));
    const mult = res.win / bet;
    if (mult >= 10) bigWin(mult >= 50 ? "MEGA WIN!" : "BIG WIN!", res.win);
    else showMsg("Você ganhou " + fmt(res.win) + " créditos!");
  } else showMsg("Sem prêmio desta vez.");
  $("cabinet").classList.remove("spinning");
  spinning = false; $("spin").disabled = false;
  return true;
}

function bigWin(text, amount) {
  $("bigtext").textContent = text; $("bigamount").textContent = "+" + fmt(amount);
  $("overlay").classList.add("show");
  for (let i = 0; i < 30; i++) {
    const c = document.createElement("div");
    c.className = "coin"; c.textContent = "🪙";
    c.style.left = Math.random() * 100 + "vw"; c.style.animationDelay = Math.random() * 1 + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 3500);
  }
  setTimeout(() => $("overlay").classList.remove("show"), 2500);
}

async function autoLoop() {
  while (auto) {
    const ok = await doSpin();
    if (!ok) break;
    await new Promise((r) => setTimeout(r, turbo ? 300 : 900));
  }
  auto = false; $("auto").classList.remove("on");
}

function renderBet() { $("bet").textContent = bets[betIdx]; }

async function start() {
  const s = await api("/api/session", "POST");
  token = s.token; localStorage.setItem("slot_token", token);
  balance = s.balance; bets = s.bets; symbols = s.symbols;
  betIdx = Math.min(2, bets.length - 1);
  $("balance").textContent = fmt(balance); renderBet(); initReels();
  $("paylist").innerHTML = symbols.map((x) => `<li>${x.icon}${x.icon}${x.icon}<span>${x.pay}×</span></li>`).join("");
}

$("spin").onclick = doSpin;
$("betUp").onclick = () => { if (!spinning) { betIdx = Math.min(bets.length - 1, betIdx + 1); renderBet(); } };
$("betDown").onclick = () => { if (!spinning) { betIdx = Math.max(0, betIdx - 1); renderBet(); } };
$("turbo").onclick = () => { turbo = !turbo; $("turbo").classList.toggle("on", turbo); };
$("auto").onclick = () => { auto = !auto; $("auto").classList.toggle("on", auto); if (auto) autoLoop(); };
$("sound").onclick = () => { soundOn = !soundOn; $("sound").textContent = soundOn ? "🔊 Som" : "🔇 Mudo"; };
$("paytable").onclick = () => $("modal").classList.add("show");
$("closeModal").onclick = () => $("modal").classList.remove("show");
$("reset").onclick = async () => { const r = await api("/api/reset", "POST"); balance = r.balance; $("balance").textContent = fmt(balance); showMsg("Saldo reiniciado."); };
document.addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); doSpin(); } });

start().catch((e) => showMsg("Erro ao conectar com o servidor: " + e.message));

// enfeites: LEDs do gabinete e brilhos flutuando
(function decor() {
  ["ledsTop", "ledsBottom"].forEach((id) => { $(id).innerHTML = "<i></i>".repeat(16); });
  const sp = $("sparkles");
  for (let i = 0; i < 22; i++) {
    const d = document.createElement("i");
    d.style.left = Math.random() * 100 + "%";
    d.style.animationDuration = 6 + Math.random() * 8 + "s";
    d.style.animationDelay = -Math.random() * 12 + "s";
    sp.appendChild(d);
  }
})();
