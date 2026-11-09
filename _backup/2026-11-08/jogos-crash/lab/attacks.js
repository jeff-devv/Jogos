// ============================================================
// Ataques didáticos contra o LABORATÓRIO local (créditos fictícios).
// Cada ataque roda contra a implementação VULNERÁVEL e contra a PROTEGIDA
// e devolve números comparáveis. Usado por tests/lab.test.js e por
// lab/run-attacks.js (relatório para o TCC).
// ============================================================
const { createWeakStream, crashFromFloat, crashPointFromSeed, sha256 } = require("../lib/rng");
const { crashTimeMs, multiplierAt } = require("../lib/multiplier");

const ROUND_END_MS = 60000; // tempo suficiente para qualquer rodada terminar (o teto cai em ~49 s)

async function newSession(h) { return (await h.call("POST", "/api/lab/session")).json; }
const start = (h, tok, engine, rng, bet) => h.call("POST", "/api/lab/start", { token: tok, engine, rng, bet });
const cash = (h, tok, engine, rng, roundId, multiplier) => h.call("POST", "/api/lab/cashout", { token: tok, engine, rng, roundId, multiplier });
const state = async (h, tok, engine, rng) => (await h.call("GET", `/api/lab/state?token=${tok}&engine=${engine}&rng=${rng}`)).json;

// Rodadas protegidas podem cair instantaneamente em 1.00x (4%): repetimos até ter uma rodada "viva".
async function attempt(fn, tries = 40) {
  let last;
  for (let i = 0; i < tries; i++) { last = await fn(i + 1); if (last.valid !== false) return { ...last, attempts: i + 1 }; }
  return { ...last, attempts: tries };
}

// ---------- A1: adulterar o multiplicador enviado na retirada ----------
async function tamperMultiplier(h, engine) {
  return attempt(async () => {
    const s = await newSession(h);
    const r = await start(h, s.token, engine, "secure", 10);
    const c = await cash(h, s.token, engine, "secure", r.json.round.roundId, 1000); // "juro que estava em 1000x"
    if (c.status === 409 && c.json.code === "ROUND_ENDED") return { valid: false };
    const bal = (await state(h, s.token, engine, "secure")).balance;
    return { status: c.status, claimed: 1000, credited: c.json.credited ?? 0, balance: bal, profit: bal - 1000 };
  });
}

// ---------- A2: repetir a requisição de retirada (replay) ----------
async function replayCashout(h, engine) {
  return attempt(async () => {
    const s = await newSession(h);
    const r = await start(h, s.token, engine, "secure", 10);
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const c = await cash(h, s.token, engine, "secure", r.json.round.roundId, 2);
      statuses.push(c.status);
      if (i === 0 && c.status === 409 && c.json.code === "ROUND_ENDED") return { valid: false };
    }
    const bal = (await state(h, s.token, engine, "secure")).balance;
    return { statuses, accepted: statuses.filter((x) => x === 200).length, balance: bal, profit: bal - 1000 };
  });
}

// ---------- A3: retirar depois que a rodada já caiu ----------
async function lateCashout(h, engine) {
  const s = await newSession(h);
  const r = await start(h, s.token, engine, "secure", 10);
  h.clock.advance(ROUND_END_MS);
  const c = await cash(h, s.token, engine, "secure", r.json.round.roundId, 2);
  const bal = (await state(h, s.token, engine, "secure")).balance;
  return { status: c.status, code: c.json.code || null, credited: c.json.credited ?? 0, balance: bal, profit: bal - 1000 };
}

// ---------- A4: aposta negativa ----------
async function negativeBet(h, engine) {
  const s = await newSession(h);
  const r = await start(h, s.token, engine, "secure", -500);
  const bal = (await state(h, s.token, engine, "secure")).balance;
  return { status: r.status, code: r.json.code || null, balance: bal, profit: bal - 1000 };
}

// ---------- A5: várias rodadas ao mesmo tempo ----------
async function parallelRounds(h, engine) {
  return attempt(async () => {
    const s = await newSession(h);
    const a = await start(h, s.token, engine, "secure", 10);
    if (engine === "secure" && (await state(h, s.token, engine, "secure")).round.status === "crashed") return { valid: false };
    const b = await start(h, s.token, engine, "secure", 10);
    return { first: a.status, second: b.status, code: b.json.code || null };
  });
}

// ---------- A6: prever o gerador (semente = relógio em segundos) ----------
// O atacante: (1) joga rodadas de 1 crédito só para OBSERVAR resultados reveladas;
// (2) testa todas as sementes plausíveis (janela de ±5 min em torno do início da sessão);
// (3) se achou, calcula as próximas rodadas e só aposta alto quando vai render.
async function predictRng(h, engine, rng, { warmup = 4, rounds = 30 } = {}) {
  const s = await newSession(h);
  const tok = s.token;
  const observed = [];
  for (let i = 0; i < warmup; i++) {
    const r = await start(h, tok, engine, rng, 1);
    h.clock.advance(ROUND_END_MS);
    const st = await state(h, tok, engine, rng);
    observed.push(engine === "vulnerable" ? st.round.crashPoint : st.round.serverSeed);
    void r;
  }

  // (2) busca da semente
  const base = Math.floor(s.createdAt / 1000);
  let stream = null;
  for (let sd = base - 300; sd <= base + 300 && !stream; sd++) {
    const g = createWeakStream(sd);
    const ok = engine === "vulnerable"
      ? observed.every((cp) => crashFromFloat(g.float()) === cp)
      : observed.every((sh) => g.seedHex() === sh);
    if (ok) stream = g;
  }

  const seedFound = !!stream;

  // (3) exploração
  let bets = 0, wins = 0, honestNet = 0;
  const startBal = (await state(h, tok, engine, rng)).balance;
  for (let i = 0; i < rounds; i++) {
    let predicted = null, predictedSeed = null;
    if (stream) {
      if (engine === "vulnerable") predicted = crashFromFloat(stream.float());
      else predictedSeed = stream.seedHex();
    }
    // vulnerável: o sorteio é feito ANTES de apostar, então só se aposta alto quando vai render.
    // protegido: o roundId só existe depois de apostar, então a aposta é sempre a mesma.
    const stake = engine === "vulnerable" && stream ? (predicted >= 2 ? 100 : 1) : 100;
    const r = await start(h, tok, engine, rng, stake);
    if (r.status !== 200) break;
    if (engine === "secure" && stream) {
      if (sha256(predictedSeed) !== r.json.round.commit) stream = null; // o compromisso público confirma (ou desmente) a previsão
      else predicted = crashPointFromSeed(predictedSeed, r.json.round.roundId);
    }
    const wait = stream && predicted !== null ? (predicted > 1 ? Math.max(0, crashTimeMs(predicted) - 1) : 0) : 5000; // sem previsão: "retira em ~2x"
    h.clock.advance(wait);
    const c = await cash(h, tok, engine, rng, r.json.round.roundId, multiplierAt(wait));
    h.clock.advance(ROUND_END_MS);
    // resultado HONESTO (medido pelo ponto de queda real, não pelo que o servidor aceitou):
    // assim a comparação isola o efeito do gerador, sem misturar as outras falhas.
    const cp = (await state(h, tok, engine, rng)).round.crashPoint;
    const survived = c.status === 200 && wait < crashTimeMs(cp);
    const result = survived ? Math.round(stake * multiplierAt(wait) * 100) / 100 - stake : -stake;
    honestNet += result;
    if (stake >= 100) { bets++; if (result > 0) wins++; }
  }
  const net = Math.round(honestNet * 100) / 100;
  return { seedFound, bets, wins, net, observed: observed.length, rounds };
}

module.exports = { tamperMultiplier, replayCashout, lateCashout, negativeBet, parallelRounds, predictRng, ROUND_END_MS };
