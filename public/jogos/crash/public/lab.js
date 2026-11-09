"use strict";
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const GROWTH = 0.00014;
const mAt = (ms) => (ms <= 0 ? 1 : Math.min(Math.floor(Math.exp(GROWTH * ms) * 100) / 100, 1000));

let token = null, engine = "vulnerable", rng = "weak", offset = 0, round = null;

async function api(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify({ token, engine, rng, ...(body || {}) }) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
function msg(t, err) { $("msg").textContent = t; $("msg").className = "msg" + (err ? " err" : ""); }
const elapsed = () => (round ? Date.now() + offset - round.startedAt : 0);
const shown = () => mAt(elapsed());

// ---- textos explicativos ----
const EX_V = ["Aposta sem validação (aceita valor negativo → saldo SOBE)", "Várias rodadas ao mesmo tempo", "Confia no multiplicador que o navegador envia", "Não confere se a rodada já caiu", "Não marca a rodada como paga (replay paga de novo)", "Gerador fraco opcional: semente = relógio em segundos"];
const EX_S = ["Valida a aposta (tipo, casas decimais, limites, saldo)", "Uma rodada ativa por jogador", "Ignora qualquer multiplicador vindo do navegador", "Recusa retirada após a queda", "Retirada só uma vez (estado da rodada)", "Compromisso SHA-256 da semente mostrado antes e revelado depois", "Gerador criptográfico (crypto.randomBytes)"];
$("exV").className = "v"; $("exS").className = "s";
$("exV").innerHTML = "<h4>✘ Vulnerável</h4><ul>" + EX_V.map((x) => `<li>${x}</li>`).join("") + "</ul>";
$("exS").innerHTML = "<h4>✔ Protegida</h4><ul>" + EX_S.map((x) => `<li>${x}</li>`).join("") + "</ul>";

function hint() {
  const h = [];
  h.push(engine === "vulnerable" ? "Implementação vulnerável: tente editar o multiplicador enviado, reenviar a retirada ou apostar −500." : "Implementação protegida: as mesmas tentativas devem ser recusadas ou ignoradas.");
  h.push(rng === "weak" ? "Gerador previsível: a semente nasce do relógio (rode o ataque A6 no terminal para ver a previsão)." : "Gerador criptográfico: sem previsão possível.");
  $("comboHint").textContent = h.join(" ");
}
function pick(seg, set) {
  $(seg).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $(seg).querySelectorAll("button").forEach((x) => { x.classList.remove("on", "bad"); });
    b.classList.add("on"); if (b.dataset.v === "vulnerable" || b.dataset.v === "weak") b.classList.add("bad");
    set(b.dataset.v); round = null; hint(); $("liveMult").textContent = "—"; $("liveInfo").textContent = ""; msg(""); refresh();
  }));
}
pick("segEngine", (v) => (engine = v));
pick("segRng", (v) => (rng = v));

// ---- ações ----
async function startRound() {
  const raw = $("bet").value.trim().replace(",", ".");
  // de propósito NÃO validamos aqui: o laboratório quer enviar o que for digitado (número ou texto)
  const bet = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  const t0 = Date.now(); const r = await api("/api/lab/start", "POST", { bet }); const t1 = Date.now();
  if (!r.ok) { msg(`Servidor recusou: ${r.data.error} (${r.status})`, true); return refresh(); }
  round = r.data.round; offset = r.data.serverNow - (t0 + t1) / 2;
  $("liveInfo").textContent = "rodada " + round.roundId.slice(0, 8) + (round.commit ? " · compromisso " + round.commit.slice(0, 12) + "…" : "");
  msg("Rodada de teste iniciada."); refresh();
}
function claimValue() {
  const v = $("claim").value.trim().toLowerCase();
  if (v === "auto" || v === "") return shown();
  const n = Number(v.replace(",", ".")); return Number.isNaN(n) ? v : n;
}
async function cashOut(forceClaim) {
  if (!round) return msg("Inicie uma rodada primeiro.", true);
  const claim = forceClaim !== undefined ? forceClaim : claimValue();
  const r = await api("/api/lab/cashout", "POST", { roundId: round.roundId, multiplier: claim });
  if (!r.ok) msg(`Servidor recusou: ${r.data.error} (${r.status})`, true);
  else msg(`Servidor aceitou. Creditado: ${fmt(r.data.credited)} (enviei ${claim}x).`);
  refresh();
}
$("start").onclick = startRound;
$("cash").onclick = () => cashOut();
$("replay").onclick = () => cashOut(lastClaim());
$("late").onclick = async () => { if (!round) return msg("Inicie uma rodada primeiro.", true); msg("Aguardando a rodada cair (até ~50 s)..."); await waitOver(); await cashOut(2); };
$("negbet").onclick = async () => { $("bet").value = "-500"; await startRound(); };
function lastClaim() { const v = Number($("claim").value.replace(",", ".")); return Number.isNaN(v) ? shown() : v; }
async function waitOver() { for (let i = 0; i < 60; i++) { const s = await api(`/api/lab/state?token=${token}&engine=${engine}&rng=${rng}`); if (s.data.round && s.data.round.crashPoint) return; await new Promise((r) => setTimeout(r, 1000)); } }
$("resetCombo").onclick = async () => { await api("/api/lab/reset", "POST"); round = null; $("liveMult").textContent = "—"; refresh(); };

// ---- painel ----
async function refresh() {
  if (!token) return;
  // comparação das 4 combinações
  const rows = [];
  for (const e of ["vulnerable", "secure"]) for (const g of ["weak", "secure"]) {
    const s = await api(`/api/lab/state?token=${token}&engine=${e}&rng=${g}`);
    const d = s.data.balance - 1000;
    rows.push(`<tr><td>${e === "vulnerable" ? "✘ vulnerável" : "✔ protegida"}</td><td>${g === "weak" ? "previsível" : "criptográfico"}</td><td>${fmt(s.data.balance)}</td><td class="${d > 0 ? "pos" : d < 0 ? "neg" : ""}">${d > 0 ? "+" : ""}${fmt(d)}</td></tr>`);
  }
  $("cmp").querySelector("tbody").innerHTML = rows.join("");
  // log
  const l = await api(`/api/lab/log?token=${token}`);
  const log = (l.data.log || []).slice(-60).reverse();
  $("log").querySelector("tbody").innerHTML = log.map((r) => {
    const sus = r.type === "cashout" && r.claimedMultiplier !== null && r.serverMultiplier !== undefined && Number(r.claimedMultiplier) > Number(r.serverMultiplier) + 0.01 && r.credited > 0;
    return `<tr class="${r.type === "cashout_rejected" ? "rej" : ""}"><td>${r.seq}</td><td>${r.type}</td><td>${r.engine}</td><td>${r.rng}</td><td>${fmt(r.bet)}</td><td class="${sus ? "flag" : ""}">${r.claimedMultiplier ?? ""}</td><td>${r.serverMultiplier ?? ""}</td><td>${r.crashPoint ?? ""}</td><td class="${sus ? "flag" : ""}">${fmt(r.credited)}</td><td>${fmt(r.balanceBefore)} → ${fmt(r.balanceAfter)}</td><td>${r.reason || ""}</td></tr>`;
  }).join("");
  $("csv").href = `/api/lab/export.csv?token=${token}`;
}

function tick() {
  if (round && round.status === "running") $("liveMult").textContent = shown().toFixed(2) + "x (exibido)";
  requestAnimationFrame(tick);
}

(async function boot() {
  hint();
  const r = await fetch("/api/lab/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  token = (await r.json()).token;
  refresh(); tick();
  setInterval(refresh, 4000);
})().catch((e) => msg("Erro ao conectar: " + e.message, true));
