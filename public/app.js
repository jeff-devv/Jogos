const $ = (id) => document.getElementById(id);
const CELL = 90;
const API = "api/";
let token = localStorage.getItem("slot_token");
let balance = 0, bets = [1000], betIdx = 0, symbols = [], blankIcon = "🐵";
let spinning = false, turbo = false, auto = false, soundOn = true;
let mode = "login";
const fmt = (c) => (Number(c) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function api(path, method = "GET", body = {}) {
  const payload = method === "GET" ? {} : { ...body };
  if (token) payload.token = token;
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Erro " + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

// ---- sons de arquivo ----
const sfx = {
  ambiente: $("sndAmbiente"), giro: $("sndGiro"),
  selecao: $("sndSelecao"), ganho: $("sndGanho"),
};
sfx.ambiente.volume = 0.3;
sfx.giro.volume = 0.5;
sfx.selecao.volume = 0.6;
sfx.ganho.volume = 0.7;

let ambienteStarted = false;
function startAmbiente() {
  if (!soundOn || ambienteStarted) return;
  sfx.ambiente.play().then(() => { ambienteStarted = true; }).catch(() => {});
}
document.addEventListener("pointerdown", startAmbiente);

function startGiro() {
  if (!soundOn) return;
  sfx.giro.currentTime = 0;
  sfx.giro.play().catch(() => {});
}
function stopGiro() { sfx.giro.pause(); sfx.giro.currentTime = 0; }
function playGanho() {
  if (!soundOn) return;
  sfx.ganho.currentTime = 0;
  sfx.ganho.play().catch(() => {});
}
function playSelecao() {
  if (!soundOn) return;
  const s = sfx.selecao.cloneNode();
  s.volume = sfx.selecao.volume;
  s.play().catch(() => {});
}
function setSound(on) {
  soundOn = on;
  if (on) {
    startAmbiente();
    if (ambienteStarted) sfx.ambiente.play().catch(() => {});
  } else {
    sfx.ambiente.pause();
    stopGiro();
  }
}

// ---- efeitos sintetizados ----
let ac;
function getAC() {
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function beep(freq, dur = 0.1, type = "sine", vol = 0.05) {
  if (!soundOn) return;
  try {
    const ctx = getAC();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch (e) {}
}
function click() {
  if (!soundOn) return;
  try {
    const ctx = getAC();
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 1800; g.gain.value = 0.25;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  } catch (e) {}
}
function fanfare(big) {
  const notes = big
    ? [523, 659, 784, 1046, 784, 1046, 1318, 1568, 1318, 1568]
    : [600, 800, 1000, 1200];
  notes.forEach((f, k) => setTimeout(() => beep(f, 0.22, "triangle", 0.08), k * (big ? 110 : 120)));
}

// ---- rolos ----
function randIcon() { return symbols[Math.floor(Math.random() * symbols.length)].icon; }
function setStrip(i, icons) {
  $("strip" + i).innerHTML = icons.map((c) => `<div class="cell">${c}</div>`).join("");
  $("strip" + i).style.transform = "translateY(0)";
}
function initReels() { for (let i = 0; i < 3; i++) setStrip(i, [randIcon(), randIcon(), randIcon()]); }

function animateReel(i, finalCol, ms) {
  return new Promise((resolve) => {
    const strip = $("strip" + i);
    const filler = 20 + i * 8;
    const icons = [];
    for (let k = 0; k < filler; k++) icons.push(randIcon());
    icons.push(...finalCol);
    strip.innerHTML = icons.map((c) => `<div class="cell">${c}</div>`).join("");
    const total = (icons.length - 3) * CELL;
    strip.classList.add("spinning");
    const anim = strip.animate([
      { transform: "translateY(0px)" },
      { transform: "translateY(18px)", offset: 0.08, easing: "linear" },
      { transform: `translateY(-${total}px)` },
    ], { duration: ms, easing: "cubic-bezier(.12,.7,.2,1)" });
    anim.finished.then(() => {
      strip.style.transform = `translateY(-${total}px)`;
      anim.cancel();
      strip.classList.remove("spinning");
      click();
      const bounce = strip.animate([
        { transform: `translateY(-${total - 9}px)` },
        { transform: `translateY(-${total}px)` },
      ], { duration: 220, easing: "cubic-bezier(.3,1.6,.5,1)" });
      bounce.finished.then(resolve);
    });
  });
}

function showMsg(t) { $("msg").textContent = t; }

function drawPaylines(lines) {
  const ys = { 0: 17, 1: 50, 2: 83 };
  const colors = ["#ff3b3b", "#ff9d00", "#ffe27a"];
  $("paylineSvg").innerHTML = lines.map((r, k) =>
    `<line x1="0" y1="${ys[r]}" x2="100" y2="${ys[r]}" stroke="${colors[k % 3]}"/>`).join("");
}

function countUp(el, to, ms = 800) {
  const start = performance.now();
  (function step(now) {
    const p = Math.min(1, (now - start) / ms);
    el.textContent = fmt(to * p);
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

function showWinPop(amount, mult) {
  const el = document.createElement("div");
  el.textContent = "+ " + fmt(amount);
  Object.assign(el.style, {
    position: "fixed", left: "50%", top: "42%", transform: "translate(-50%, -50%)",
    fontSize: mult >= 10 ? "64px" : "48px", fontWeight: "900", color: "#7dff9a",
    textShadow: "0 0 18px #7dff9a, 0 4px 0 #0a4a18, 0 0 4px #fff",
    pointerEvents: "none", zIndex: "13", whiteSpace: "nowrap", opacity: "0",
  });
  document.body.appendChild(el);
  const anim = el.animate([
    { transform: "translate(-50%,-50%) scale(.3)", opacity: 0, offset: 0 },
    { transform: "translate(-50%,-50%) scale(1.25)", opacity: 1, offset: 0.25 },
    { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.4 },
    { transform: "translate(-50%,-50%) scale(1.08)", opacity: 1, offset: 0.6 },
    { transform: "translate(-50%,-70%) scale(1)", opacity: 1, offset: 0.85 },
    { transform: "translate(-50%,-90%) scale(.95)", opacity: 0, offset: 1 },
  ], { duration: 2000, easing: "ease-out" });
  anim.finished.then(() => el.remove());
}

function screenFlash(strong = false) {
  const f = document.createElement("div");
  f.className = "flash";
  f.style.background = strong
    ? "radial-gradient(circle,rgba(255,250,200,.95),rgba(255,180,0,.6) 60%,transparent)"
    : "radial-gradient(circle,rgba(255,240,150,.7),transparent 70%)";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

function confetti(n = 80) {
  const colors = ["#ff3b3b", "#ffd23f", "#5eea6a", "#3ec7ff", "#ff7ad9", "#ffffff", "#ff9d00"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.width = (6 + Math.random() * 8) + "px";
    c.style.height = (10 + Math.random() * 10) + "px";
    c.style.animationDelay = Math.random() * 0.8 + "s";
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

function coinRain(n = 30) {
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "coin";
    c.textContent = "🪙";
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDelay = Math.random() * 1.2 + "s";
    c.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3500);
  }
}

function shakeMachine() {
  document.querySelector(".machine").animate([
    { transform: "translate(0,0)" }, { transform: "translate(-6px,3px)" },
    { transform: "translate(6px,-3px)" }, { transform: "translate(-4px,2px)" },
    { transform: "translate(4px,-2px)" }, { transform: "translate(0,0)" },
  ], { duration: 450, easing: "ease-out" });
}

function pulseWin() {
  const w = $("win");
  w.classList.remove("win-pulse");
  void w.offsetWidth;
  w.classList.add("win-pulse");
}

function tigerJump(big = false) {
  const t = $("tiger");
  const W = window.innerWidth;
  const height = big ? 300 : 150;
  const dur = big ? 2200 : 1300;
  t.style.opacity = 1;
  const anim = t.animate([
    { transform: "translate(-150px,0) rotate(0deg)", offset: 0 },
    { transform: `translate(${W * 0.25}px,-${height}px) rotate(-12deg)`, offset: 0.3 },
    { transform: `translate(${W * 0.5}px,0) rotate(0deg)`, offset: 0.5 },
    { transform: `translate(${W * 0.75}px,-${height * 0.7}px) rotate(10deg)`, offset: 0.75 },
    { transform: `translate(${W + 150}px,0) rotate(0deg)`, offset: 1 },
  ], { duration: dur, easing: "ease-in-out" });
  if (big) beep(140, 0.5, "sawtooth", 0.08);
  anim.finished.then(() => { t.style.opacity = 0; });
}

function explodeWinningCells() {
  const reels = $("reels");
  const base = reels.getBoundingClientRect();
  document.querySelectorAll(".cell.win").forEach((cell, k) => {
    setTimeout(() => {
      const r = cell.getBoundingClientRect();
      const b = document.createElement("div");
      b.className = "boom";
      b.textContent = "💥";
      b.style.left = (r.left - base.left + r.width / 2) + "px";
      b.style.top = (r.top - base.top + r.height / 2) + "px";
      reels.appendChild(b);
      playSelecao();
      beep(180 + Math.random() * 80, 0.25, "square", 0.04);
      setTimeout(() => b.remove(), 700);
    }, k * 120);
  });
}

function celebrate(win, mult) {
  const tier = mult >= 50 ? 3 : mult >= 10 ? 2 : 1;
  screenFlash(tier >= 2);
  confetti(tier === 1 ? 50 : tier === 2 ? 120 : 200);
  coinRain(tier === 1 ? 10 : tier === 2 ? 30 : 60);
  if (tier >= 2) shakeMachine();
  pulseWin();
  if (tier >= 2) {
    setTimeout(() => screenFlash(true), 250);
    setTimeout(() => confetti(tier === 3 ? 150 : 80), 600);
  }
  if (tier === 3) {
    setTimeout(() => shakeMachine(), 900);
    setTimeout(() => coinRain(40), 1200);
  }
}

function bigWin(text, amount) {
  $("bigtext").textContent = text;
  $("bigamount").textContent = "+" + fmt(amount);
  $("overlay").classList.add("show");
  setTimeout(() => $("overlay").classList.remove("show"), 2800);
}

// ---- giro ----
async function doSpin() {
  if (spinning) return false;
  startAmbiente();
  const bet = bets[betIdx];
  if (balance < bet) {
    showMsg("Saldo insuficiente. Fale com o administrador para receber crédito.");
    auto = false; $("auto").classList.remove("on");
    return false;
  }
  spinning = true; $("spin").disabled = true; showMsg(""); $("win").textContent = fmt(0);
  document.querySelectorAll(".cell.win").forEach((c) => c.classList.remove("win"));
  document.querySelectorAll(".boom").forEach((b) => b.remove());
  $("paylineSvg").innerHTML = "";
  $("frame").classList.remove("winning");

  let res;
  try {
    res = await api("spin.php", "POST", { bet });
  } catch (e) {
    showMsg(e.message); spinning = false; $("spin").disabled = false;
    auto = false; $("auto").classList.remove("on");
    if (e.status === 401) logout(true);
    return false;
  }

  balance = res.balance - res.win; $("balance").textContent = fmt(balance);
  beep(500, 0.05);

  const cols = [0, 1, 2].map((c) => res.grid.map((row) => row[c]));
  const nearMiss = cols[0][1] === cols[1][1];
  const base = turbo ? 550 : 1200;

  startGiro();
  const reels = [0, 1, 2].map((i) => {
    const extra = (i === 2 && nearMiss) ? 1.6 : 1;
    const duration = (base + i * (base / 3)) * extra;
    return animateReel(i, cols[i], duration);
  });
  await Promise.all(reels);
  stopGiro();

  balance = res.balance; $("balance").textContent = fmt(balance);
  if (res.win > 0) {
    res.winningLines.forEach((r) => [0, 1, 2].forEach((c) => {
      const s = $("strip" + c);
      s.children[s.children.length - 3 + r].classList.add("win");
    }));
    drawPaylines(res.winningLines);
    const mult = res.win / bet;
    explodeWinningCells();
    tigerJump(mult >= 10);
    $("frame").classList.add("winning");
    countUp($("win"), res.win);
    $("balance").classList.add("pop");
    setTimeout(() => $("balance").classList.remove("pop"), 600);
    playGanho();
    fanfare(mult >= 10);
    celebrate(res.win, mult);
    showWinPop(res.win, mult);
    if (mult >= 10) bigWin(mult >= 50 ? "MEGA WIN!" : "BIG WIN!", res.win);
    else showMsg("Você ganhou " + fmt(res.win) + " créditos!");
  } else showMsg("Sem prêmio desta vez.");
  spinning = false; $("spin").disabled = false;
  return true;
}

async function autoLoop() {
  while (auto) {
    const ok = await doSpin();
    if (!ok) break;
    await new Promise((r) => setTimeout(r, turbo ? 300 : 900));
  }
  auto = false; $("auto").classList.remove("on");
}

function renderBet() { $("bet").textContent = fmt(bets[betIdx]); }

function showAuth() { $("game").hidden = true; $("auth").hidden = false; }
function showGame() { $("auth").hidden = true; $("game").hidden = false; }

async function loadGame() {
  const me = await api("me.php");
  balance = me.balance; bets = me.bets; symbols = me.symbols; blankIcon = me.blank;
  betIdx = Math.min(2, bets.length - 1);
  $("hUser").textContent = me.username;
  $("balance").textContent = fmt(balance);
  renderBet();
  initReels();
  $("paylist").innerHTML = symbols.map((x) => `<li>${x.icon} ${x.icon} ${x.icon} → ${x.pay}× a aposta da linha</li>`).join("");
  $("blankNote").textContent = `${blankIcon} = símbolo vazio: não paga nada e nunca forma linha.`;
  showGame();
}

async function logout(silent = false) {
  if (token && !silent) { try { await api("logout.php"); } catch (e) {} }
  token = null;
  localStorage.removeItem("slot_token");
  auto = false;
  showAuth();
  if (!silent) $("authMsg").textContent = "";
}

// ---- login / cadastro ----
function setMode(m) {
  mode = m;
  $("tabLogin").classList.toggle("on", m === "login");
  $("tabRegister").classList.toggle("on", m === "register");
  $("authBtn").textContent = m === "login" ? "Entrar" : "Criar conta";
  $("authMsg").textContent = "";
}
$("tabLogin").onclick = () => setMode("login");
$("tabRegister").onclick = () => setMode("register");

$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const username = $("inUser").value.trim();
  const password = $("inPass").value;
  $("authMsg").textContent = "";
  try {
    if (mode === "register") {
      await api("register.php", "POST", { username, password });
      setMode("login");
      $("authMsg").textContent = "Conta criada. Agora entre.";
      return;
    }
    const r = await api("login.php", "POST", { username, password });
    token = r.token;
    localStorage.setItem("slot_token", token);
    $("inPass").value = "";
    location.href = "home.html";
  } catch (err) {
    $("authMsg").textContent = err.message;
  }
};

$("spin").onclick = doSpin;
$("betUp").onclick = () => { if (!spinning) { betIdx = Math.min(bets.length - 1, betIdx + 1); renderBet(); } };
$("betDown").onclick = () => { if (!spinning) { betIdx = Math.max(0, betIdx - 1); renderBet(); } };
$("turbo").onclick = () => { turbo = !turbo; $("turbo").classList.toggle("on", turbo); };
$("auto").onclick = () => { auto = !auto; $("auto").classList.toggle("on", auto); if (auto) autoLoop(); };
$("sound").onclick = () => {
  setSound(!soundOn);
  $("sound").textContent = soundOn ? "🔊 Som" : "🔇 Mudo";
};
$("paytable").onclick = () => $("modal").classList.add("show");
$("closeModal").onclick = () => $("modal").classList.remove("show");
$("modal").onclick = (e) => { if (e.target === $("modal")) $("modal").classList.remove("show"); };
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !$("game").hidden) { e.preventDefault(); doSpin(); }
});

// Atualiza o saldo a cada 5 segundos, sem interromper um giro
setInterval(async () => {
  if (!token || spinning || $("game").hidden) return;
  try {
    const me = await api("me.php");
    if (!spinning && me.balance !== balance) {
      balance = me.balance;
      $("balance").textContent = fmt(balance);
    }
  } catch (e) {}
}, 5000);

// Ao abrir: se já há sessão, mostra o jogo na mesma página
(async function init() {
  const abrirSlot = new URLSearchParams(location.search).has("jogar");
  if (!token) return showAuth();
  if (!abrirSlot) { location.href = "home.html"; return; }
  try { await loadGame(); }
  catch (e) { logout(true); }
})();
