"use strict";
// ============================================================
// Cliente do Crash. O navegador SÓ desenha e envia comandos
// ("iniciar" / "retirar"). Quem decide queda, multiplicador e
// prêmio é o servidor.
// ============================================================
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = (n) => Number(n).toFixed(2) + "x";

let token = null, cfg = { growth: 0.00014, maxMult: 1000, minBet: 1, maxBet: 1000, edge: 0.04 };
let balance = 0, soundOn = true, busy = false;
// estado local da rodada (só para animar)
const S = { phase: "idle", round: null, offset: 0, crashPoint: null, cashAt: null, ghostEnd: null, ghostDone: false, crashedAtPerf: 0, last: null };

// mesma curva do servidor (lib/multiplier.js) — apenas para desenhar
const mAt = (ms) => (ms <= 0 ? 1 : Math.min(Math.floor(Math.exp(cfg.growth * ms) * 100) / 100, cfg.maxMult));
const tFor = (m) => (m <= 1 ? 0 : Math.ceil(Math.log(m) / cfg.growth));
const elapsed = () => (S.round ? Date.now() + S.offset - S.round.startedAt : 0);

async function api(path, method = "GET", body) {
  const r = await fetch(NODE_API + path, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify({ token, ...(body || {}) }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || "Erro " + r.status); e.status = r.status; e.data = data; throw e; }
  return data;
}

// ---------------- som ----------------
let ac, hum;
function ctx() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch {} return ac; }
function tone(freq, dur, type = "sine", vol = 0.06, when = 0, slideTo) {
  if (!soundOn || !ctx()) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.12) {
  if (!soundOn || !ctx()) return;
  const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(ac.destination); s.start();
}
const sfx = {
  start() { tone(220, 0.45, "sawtooth", 0.05, 0, 660); tone(440, 0.2, "square", 0.03, 0.05); },
  cash() { tone(880, 0.12, "triangle", 0.08); tone(1175, 0.12, "triangle", 0.08, 0.1); tone(1568, 0.28, "triangle", 0.08, 0.2); },
  crash() { noise(0.6, 0.16); tone(180, 0.7, "sawtooth", 0.09, 0, 40); },
};
function humStart() {
  if (!soundOn || !ctx() || hum) return;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = "sawtooth"; o.frequency.value = 90; g.gain.value = 0.012;
  o.connect(g); g.connect(ac.destination); o.start(); hum = { o, g };
}
function humSet(m) { if (hum) hum.o.frequency.value = 90 + Math.min(m, 30) * 14; }
function humStop() { if (hum) { try { hum.o.stop(); } catch {} hum = null; } }

// ---------------- interface ----------------
function bump(id) { const e = $(id); e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump"); }
function setMsg(t, err = false) { $("msg").textContent = t; $("msg").classList.toggle("err", err); }
function setBalance(v) { balance = v; $("balance").textContent = fmt(v); }

function renderHistory(list) {
  const el = $("history");
  if (!list || !list.length) { el.innerHTML = '<span class="empty">nenhuma rodada ainda</span>'; return; }
  el.innerHTML = list.map((h) => {
    const c = h.crashPoint, cls = c < 2 ? "low" : c < 10 ? "mid" : "high";
    return `<span class="chip ${cls}${h.status === "cashed" ? " won" : ""}" title="${h.status === "cashed" ? "retirou em " + fx(h.cashedAt) : "perdeu a aposta"}">${fx(c)}</span>`;
  }).join("");
}

function refreshControls() {
  const running = S.phase === "running";
  $("start").disabled = running || busy;
  $("cash").disabled = !running || busy;
  $("bet").disabled = running;
  $("betHalf").disabled = running; $("betDouble").disabled = running;
  $("reset").disabled = running;
  $("verify").disabled = !S.last;
}
function paintPhase() {
  const m = $("mult"), st = $("status"), sub = $("sub2");
  m.className = "mult " + S.phase;
  if (S.phase === "idle") { st.textContent = "Aguardando rodada"; sub.textContent = "Defina a aposta e inicie a rodada"; m.textContent = "1.00x"; }
  if (S.phase === "running") { st.textContent = "Em voo"; sub.textContent = "Retire antes que o avião caia"; }
  if (S.phase === "crashed") { st.textContent = "Caiu!"; sub.textContent = "Rodada encerrada em " + fx(S.crashPoint) + " · aposta perdida"; m.textContent = fx(S.crashPoint); }
  if (S.phase === "cashed") { st.textContent = "Retirada confirmada"; sub.textContent = `Você saiu em ${fx(S.cashAt)} · acompanhando o voo...`; }
  refreshControls();
}

// ---------------- ações ----------------
async function startRound() {
  if (busy || S.phase === "running") return;
  const bet = Number($("bet").value);
  if (!Number.isFinite(bet) || bet < cfg.minBet || bet > cfg.maxBet) return setMsg(`Aposta entre ${cfg.minBet} e ${cfg.maxBet} créditos.`, true);
  if (Math.round(bet * 100) / 100 !== bet) return setMsg("Use no máximo 2 casas decimais.", true);
  if (bet > balance) return setMsg("Saldo insuficiente. Peça crédito ao administrador.", true);
  busy = true; refreshControls(); setMsg("");
  try {
    const t0 = Date.now();
    const r = await api("/api/crash/start", "POST", { bet });
    const t1 = Date.now();
    S.round = r.round; S.offset = r.serverNow - (t0 + t1) / 2;
    S.phase = "running"; S.crashPoint = null; S.cashAt = null; S.ghostEnd = null; S.ghostDone = false;
    setBalance(r.balance); $("staked").textContent = fmt(bet); $("prize").textContent = fmt(bet); $("prizeLabel").textContent = "PRÊMIO POSSÍVEL";
    sfx.start(); humStart();
    paintPhase(); schedulePoll();
  } catch (e) { await handleError(e); }
  busy = false; refreshControls();
}

async function cashOut() {
  if (busy || S.phase !== "running") return;
  busy = true; $("cash").disabled = true;
  const shown = mAt(elapsed());
  try {
    const r = await api("/api/crash/cashout", "POST", { roundId: S.round.roundId, displayedMultiplier: shown });
    S.phase = "cashed"; S.cashAt = r.multiplier; S.crashPoint = r.round.crashPoint; S.ghostEnd = tFor(S.crashPoint);
    S.last = { ...S.round, ...r.round };
    setBalance(r.balance); bump("balance"); $("prize").textContent = fmt(r.payout); $("prizeLabel").textContent = "PRÊMIO"; bump("prize");
    renderHistory(r.history); humStop(); sfx.cash();
    $("chartcard").classList.remove("won"); void $("chartcard").offsetWidth; $("chartcard").classList.add("won");
    setMsg(`Você retirou em ${fx(r.multiplier)} e recebeu ${fmt(r.payout)} créditos.`);
    paintPhase();
  } catch (e) {
    if (e.status === 409 && e.data && e.data.code === "ROUND_ENDED") onCrash({ ...S.round, ...e.data, roundId: S.round.roundId });
    else await handleError(e);
  }
  busy = false; refreshControls();
}

function onCrash(view) {
  if (S.phase !== "running" || !S.round || view.roundId !== S.round.roundId) return;
  S.phase = "crashed"; S.crashPoint = view.crashPoint; S.crashedAtPerf = performance.now();
  S.last = { ...S.round, ...view };
  humStop(); sfx.crash();
  $("prize").textContent = fmt(0); $("prizeLabel").textContent = "PRÊMIO";
  $("chartcard").classList.remove("flash"); void $("chartcard").offsetWidth; $("chartcard").classList.add("flash");
  setMsg(`A rodada caiu em ${fx(view.crashPoint)}. Você perdeu ${fmt(S.round.bet)} créditos fictícios.`, true);
  paintPhase(); loadState();
}

async function loadState() {
  try { const s = await api(`/api/crash/state?token=${token}`); setBalance(s.balance); renderHistory(s.history); return s; } catch { return null; }
}

// plano B caso o SSE falhe: consulta o servidor a cada 1 s enquanto a rodada corre
let pollTimer = null;
function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    if (S.phase !== "running") return;
    const s = await loadState();
    if (s && s.round && s.round.roundId === S.round.roundId && s.round.status === "crashed") onCrash(s.round);
    schedulePoll();
  }, 1000);
}

async function handleError(e) {
  if (e.data && e.data.code === "NO_SESSION") { S.phase = "idle"; humStop(); await goLogin("servidor recusou o token ao iniciar a rodada (" + e.message + ")"); return; }
  if (e.data && e.data.code === "ROUND_ACTIVE") { setMsg("Já existe uma rodada em andamento.", true); await loadState(); return; }
  if (e instanceof TypeError) { setMsg("Sem conexão com o servidor. Verifique se a janela do servidor está aberta.", true); return; }
  setMsg(e.message, true);
}

// ---------------- verificação (compromisso/revelação) ----------------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256hex(s) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function crashFromSeed(seed, roundId) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const b = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(roundId)));
  const hi = ((b[0] << 16) | (b[1] << 8) | b[2]) >>> 4;
  const lo = b[3] * 16777216 + b[4] * 65536 + b[5] * 256 + b[6];
  const r = (hi * 2 ** 32 + lo) / 2 ** 52;
  return Math.min(cfg.maxMult, Math.max(1, Math.floor(((1 - cfg.edge) / (1 - r)) * 100) / 100));
}
async function verifyLast() {
  const L = S.last; if (!L || !L.serverSeed) return;
  const okCommit = (await sha256hex(L.serverSeed)) === L.commit;
  const recomputed = await crashFromSeed(L.serverSeed, L.roundId);
  const okCrash = recomputed === L.crashPoint;
  $("vdata").innerHTML = `
    <dt>ID da rodada</dt><dd>${L.roundId}</dd>
    <dt>Compromisso mostrado ANTES (sha256 da semente)</dt><dd>${L.commit}</dd>
    <dt>Semente revelada DEPOIS</dt><dd>${L.serverSeed}</dd>
    <dt>sha256(semente) = compromisso?</dt><dd class="${okCommit ? "ok" : "bad"}">${okCommit ? "SIM ✔ (o servidor não trocou o resultado)" : "NÃO ✘"}</dd>
    <dt>Ponto de queda recalculado aqui (HMAC-SHA256)</dt><dd>${fx(recomputed)} &nbsp;|&nbsp; informado pelo servidor: ${fx(L.crashPoint)} <span class="${okCrash ? "ok" : "bad"}">${okCrash ? "✔ confere" : "✘ diferente"}</span></dd>`;
  $("modal").classList.add("show");
}

// ---------------- desenho do gráfico ----------------
const cv = $("chart"), g = cv.getContext("2d");
function fit() {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}
function niceStep(range, target = 4) {
  const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}
function drawPlane(x, y, ang, t) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const fl = 14 + Math.random() * 12;                       // chama
  const fg = g.createLinearGradient(-12, 0, -12 - fl, 0); fg.addColorStop(0, "#fff3a0"); fg.addColorStop(0.5, "#ff9d00"); fg.addColorStop(1, "rgba(255,60,0,0)");
  g.fillStyle = fg; g.beginPath(); g.moveTo(-10, -4); g.lineTo(-12 - fl, 0); g.lineTo(-10, 4); g.closePath(); g.fill();
  g.shadowColor = "rgba(255,210,74,.9)"; g.shadowBlur = 14;
  g.fillStyle = "#ffe27a"; g.beginPath(); g.moveTo(-6, -3); g.lineTo(-20, -15); g.lineTo(-14, 0); g.lineTo(-20, 15); g.lineTo(-6, 3); g.closePath(); g.fill(); // asas
  const bg = g.createLinearGradient(0, -7, 0, 7); bg.addColorStop(0, "#fffbe0"); bg.addColorStop(1, "#f0a81a");
  g.fillStyle = bg; g.beginPath(); g.moveTo(26, 0); g.quadraticCurveTo(8, -9, -12, -6); g.lineTo(-12, 6); g.quadraticCurveTo(8, 9, 26, 0); g.fill(); // corpo
  g.shadowBlur = 0; g.fillStyle = "#c4161f"; g.beginPath(); g.arc(8, 0, 3, 0, 7); g.fill();
  g.restore();
}
function drawExplosion(x, y, age) {
  const k = Math.min(1, age / 700);
  g.save(); g.translate(x, y);
  const r = 8 + k * 70, grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grd.addColorStop(0, `rgba(255,240,160,${0.9 * (1 - k)})`); grd.addColorStop(0.5, `rgba(255,120,20,${0.6 * (1 - k)})`); grd.addColorStop(1, "rgba(255,40,0,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = `rgba(255,200,80,${1 - k})`; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, d1 = 10 + k * 60, d2 = d1 + 14 * (1 - k); g.beginPath(); g.moveTo(Math.cos(a) * d1, Math.sin(a) * d1); g.lineTo(Math.cos(a) * d2, Math.sin(a) * d2); g.stroke(); }
  g.restore();
}

function frame() {
  const { w, h } = fit();
  g.clearRect(0, 0, w, h);
  const bgG = g.createLinearGradient(0, 0, 0, h); bgG.addColorStop(0, "#2a0a10"); bgG.addColorStop(1, "#100205");
  g.fillStyle = bgG; g.fillRect(0, 0, w, h);

  // tempo exibido
  let e = 0, crashedNow = false;
  if (S.phase === "running") { e = Math.max(0, elapsed()); }
  else if (S.phase === "cashed") { e = Math.min(Math.max(0, elapsed()), S.ghostEnd); if (e >= S.ghostEnd && !S.ghostDone) { S.ghostDone = true; $("sub2").textContent = `Você saiu em ${fx(S.cashAt)} · o avião caiu em ${fx(S.crashPoint)}`; sfx.crash(); } }
  else if (S.phase === "crashed") { e = tFor(S.crashPoint); crashedNow = true; }
  const mNow = S.phase === "crashed" ? S.crashPoint : S.phase === "cashed" ? mAt(e) : mAt(e);

  const padL = 44, padB = 26, padT = 18, padR = 22;
  const tMax = Math.max(8000, e * 1.1), mMax = Math.max(2, Math.exp(cfg.growth * e) * 1.18);
  const X = (t) => padL + (t / tMax) * (w - padL - padR);
  const Y = (m) => h - padB - ((m - 1) / (mMax - 1)) * (h - padB - padT);

  // grade e eixos
  g.font = "11px Poppins, sans-serif"; g.fillStyle = "rgba(255,230,170,.65)"; g.strokeStyle = "rgba(255,210,74,.12)"; g.lineWidth = 1;
  const ms = niceStep(mMax - 1);
  for (let v = 1 + ms; v < mMax; v += ms) { const y = Y(v); g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke(); g.textAlign = "right"; g.fillText(v.toFixed(v < 10 && ms < 1 ? 1 : 0) + "x", padL - 6, y + 4); }
  const ts = niceStep(tMax / 1000, 5) * 1000;
  for (let t = ts; t < tMax; t += ts) { const x = X(t); g.beginPath(); g.moveTo(x, padT); g.lineTo(x, h - padB); g.stroke(); g.textAlign = "center"; g.fillText(t / 1000 + "s", x, h - 8); }
  g.strokeStyle = "rgba(255,210,74,.45)"; g.beginPath(); g.moveTo(padL, padT); g.lineTo(padL, h - padB); g.lineTo(w - padR, h - padB); g.stroke();

  if (S.phase !== "idle") {
    // curva
    const N = 140, pts = [];
    for (let i = 0; i <= N; i++) { const t = (e * i) / N; pts.push([X(t), Y(Math.exp(cfg.growth * t))]); }
    const ghost = S.phase === "cashed", lost = S.phase === "crashed";
    const col = lost ? "#ff4d5a" : ghost ? "#8dff9b" : "#ffd24a";
    const fill = g.createLinearGradient(0, padT, 0, h - padB); fill.addColorStop(0, lost ? "rgba(255,77,90,.35)" : ghost ? "rgba(103,242,122,.30)" : "rgba(255,210,74,.35)"); fill.addColorStop(1, "rgba(255,210,74,0)");
    g.beginPath(); g.moveTo(pts[0][0], h - padB); pts.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(pts[N][0], h - padB); g.closePath(); g.fillStyle = fill; g.fill();
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = col; g.lineWidth = 4; g.lineJoin = "round"; g.shadowColor = col; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0;

    // marca da retirada
    if (S.cashAt) {
      const tc = tFor(S.cashAt), cx = X(tc), cy = Y(Math.exp(cfg.growth * tc));
      g.fillStyle = "#ffd24a"; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      g.fillStyle = "#ffd24a"; g.textAlign = cx > w * 0.7 ? "right" : "left"; g.font = "700 12px Poppins, sans-serif"; g.fillText("retirou " + fx(S.cashAt), cx + (cx > w * 0.7 ? -10 : 10), cy + 22);
    }
    // avião / explosão
    const [lx, ly] = pts[N], [px, py] = pts[Math.max(0, N - 3)];
    if (lost) drawExplosion(lx, ly, performance.now() - S.crashedAtPerf);
    else if (!(ghost && S.ghostDone)) drawPlane(lx, ly, Math.atan2(ly - py, lx - px), e);
    else drawExplosion(lx, ly, performance.now() - (S.ghostDoneAt || (S.ghostDoneAt = performance.now())));
  }

  // número grande
  if (S.phase === "running") { $("mult").textContent = fx(mNow); humSet(mNow); $("prize").textContent = fmt(Math.floor(S.round.bet * mNow * 100) / 100); }
  else if (S.phase === "cashed") $("mult").textContent = fx(S.ghostDone ? S.crashPoint : mNow);
  if (S.phase !== "cashed") S.ghostDoneAt = 0;
  requestAnimationFrame(frame);
}

// ---------------- eventos ----------------
$("start").onclick = startRound;
$("cash").onclick = cashOut;
$("betHalf").onclick = () => { $("bet").value = Math.max(cfg.minBet, Math.floor(Number($("bet").value) / 2)); };
$("betDouble").onclick = () => { $("bet").value = Math.min(cfg.maxBet, Math.floor(balance), Number($("bet").value) * 2); };
$("sound").onclick = () => { soundOn = !soundOn; $("sound").textContent = soundOn ? "🔊 Som" : "🔇 Mudo"; if (!soundOn) humStop(); };
$("verify").onclick = verifyLast;
$("closeModal").onclick = () => $("modal").classList.remove("show");
$("reset").onclick = async () => {
  try { const r = await api("/api/reset", "POST"); setBalance(r.balance); S.phase = "idle"; S.round = null; $("staked").textContent = fmt(0); $("prize").textContent = fmt(0); paintPhase(); setMsg("Saldo reiniciado."); }
  catch (e) { await handleError(e); }
};
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.code === "Space") { e.preventDefault(); if (S.phase === "running") cashOut(); else startRound(); }
});

let es;
function openStream() {
  if (es) es.close();
  es = new EventSource(`${NODE_API}/api/crash/stream?token=${token}`);
  es.addEventListener("crash", (ev) => { try { onCrash(JSON.parse(ev.data)); } catch {} });
}

// ---------------- login único: o token vem do login do site (mesmo endereço, mesmo localStorage) ----------------
const NODE_API = "http://localhost:3000";                         // API do crash (Node)
const TOKEN_KEY = "slot_token";                                   // mesma chave do app.js do login
const LOGIN_URL = new URL("../../", location.href).href;          // public/ (tela de login)
const goLogin = (why) => {
  localStorage.removeItem(TOKEN_KEY);
  setMsg("Voltando ao login em 10 s. Motivo: " + why, true);
  setTimeout(() => { location.href = LOGIN_URL; }, 10000);
  return new Promise(() => {});
};

async function boot() {
  token = localStorage.getItem(TOKEN_KEY);
  if (!token) return goLogin("você ainda não entrou na conta");

  let s;
  try { s = await api("/api/session", "POST"); }
  catch (e) {
    if (e.status === 401 || (e.data && e.data.code === "NO_SESSION")) return goLogin("servidor recusou o token (" + e.message + ")");
    throw e;
  }
  cfg = { ...cfg, ...s.crash }; setBalance(s.balance);
  $("bet").min = cfg.minBet; $("bet").max = cfg.maxBet;
  openStream();
}

boot().then(() => { paintPhase(); requestAnimationFrame(frame); })
  .catch((e) => { setMsg("Erro ao conectar com o servidor: " + e.message, true); requestAnimationFrame(frame); });