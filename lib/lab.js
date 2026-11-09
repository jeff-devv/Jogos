// ============================================================
// LABORATÓRIO ACADÊMICO
// - Saldos SEPARADOS do jogo normal (nunca toca nos jogadores reais).
// - Toda rodada é marcada como TESTE e registrada num log.
// - Compara 2 implementações x 2 geradores = 4 "contas" de teste:
//     vulnerable:weak   vulnerable:secure   secure:weak   secure:secure
// ============================================================
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { HttpError, round2 } = require("./common");
const { SecureCrashEngine } = require("./crash-secure");
const { VulnerableCrashEngine } = require("./crash-vulnerable");
const { createWeakStream, secureFloat, secureSeedHex } = require("./rng");

const LAB_CREDITS = 1000;
const ENGINES = ["vulnerable", "secure"];
const RNGS = ["weak", "secure"];
const MAX_SESSIONS = 200;
const MAX_LOG = 5000;

class Lab {
  constructor({ now = Date.now, logFile = path.join(__dirname, "..", "logs", "lab-events.jsonl") } = {}) {
    this.now = now; this.logFile = logFile; this.sessions = new Map();
  }

  createSession() {
    if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
    const token = crypto.randomUUID();
    const s = { token, createdAt: this.now(), accounts: new Map(), log: [], seq: 0 };
    this.sessions.set(token, s);
    return s;
  }
  session(token) {
    const s = typeof token === "string" ? this.sessions.get(token) : undefined;
    if (!s) throw new HttpError(404, "Sessão de laboratório não encontrada", { code: "NO_SESSION" });
    return s;
  }

  key(engine, rng) {
    if (!ENGINES.includes(engine) || !RNGS.includes(rng)) throw new HttpError(400, "engine/rng inválidos", { code: "BAD_COMBO" });
    return `${engine}:${rng}`;
  }

  // cria (uma vez) a conta de teste e o motor da combinação escolhida
  account(s, engine, rng) {
    const key = this.key(engine, rng);
    let acc = s.accounts.get(key);
    if (acc) return acc;
    const onEvent = (ev) => this.record(s, { engine, rng, ...ev });
    const player = { balance: LAB_CREDITS, round: null, history: [] };
    let eng;
    if (engine === "vulnerable") {
      // FALHA do gerador fraco: a semente é o relógio em SEGUNDOS no momento da criação.
      const nextFloat = rng === "weak" ? createWeakStream(Math.floor(this.now() / 1000)).float : secureFloat;
      eng = new VulnerableCrashEngine({ now: this.now, nextFloat, onEvent });
    } else {
      const newSeed = rng === "weak" ? createWeakStream(Math.floor(this.now() / 1000)).seedHex : secureSeedHex;
      eng = new SecureCrashEngine({ now: this.now, newSeed, onEvent });
    }
    acc = { key, engine, rng, player, eng };
    s.accounts.set(key, acc);
    return acc;
  }

  record(s, ev) {
    const row = { seq: ++s.seq, ts: new Date(this.now()).toISOString(), mode: "TESTE", session: s.token.slice(0, 8), ...ev };
    s.log.push(row);
    if (s.log.length > MAX_LOG) s.log.shift();
    if (this.logFile) { try { fs.mkdirSync(path.dirname(this.logFile), { recursive: true }); fs.appendFileSync(this.logFile, JSON.stringify(row) + "\n"); } catch {} }
  }

  start(token, engine, rng, bet) {
    const s = this.session(token); const a = this.account(s, engine, rng);
    const r = a.eng.start(a.player, bet);
    return { test: true, engine, rng, balance: a.player.balance, round: a.eng.view(r), serverNow: this.now() };
  }
  cashout(token, engine, rng, roundId, multiplier) {
    const s = this.session(token); const a = this.account(s, engine, rng);
    let r;
    try { r = a.eng.cashout(a.player, roundId, multiplier); }
    catch (e) { if (e instanceof HttpError) this.record(s, { engine, rng, type: "cashout_rejected", roundId, claimedMultiplier: multiplier ?? null, reason: e.extra.code || e.message, balanceBefore: a.player.balance, balanceAfter: a.player.balance, credited: 0 }); throw e; }
    if (!r) throw new HttpError(404, "Rodada não encontrada", { code: "NO_ROUND" });
    return { test: true, engine, rng, balance: a.player.balance, round: a.eng.view(r), credited: r.payout };
  }
  state(token, engine, rng) {
    const s = this.session(token); const a = this.account(s, engine, rng);
    if (a.engine === "secure") a.eng.resolve(a.player);
    const last = a.engine === "secure" ? a.player.round : (a.player.rounds && a.player.rounds.get(a.player.lastRoundId));
    return { test: true, engine, rng, balance: a.player.balance, round: a.eng.view(last), history: a.player.history, serverNow: this.now(), createdAt: s.createdAt };
  }
  reset(token, engine, rng) {
    const s = this.session(token); const key = this.key(engine, rng);
    s.accounts.delete(key);
    return this.state(token, engine, rng);
  }

  csv(token) {
    const s = this.session(token);
    const cols = ["seq", "ts", "mode", "engine", "rng", "type", "roundId", "bet", "claimedMultiplier", "serverMultiplier", "crashPoint", "credited", "balanceBefore", "balanceAfter", "reason"];
    const esc = (v) => (v === undefined || v === null ? "" : `"${String(v).replace(/"/g, '""')}"`);
    return [cols.join(","), ...s.log.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  }
}

module.exports = { Lab, LAB_CREDITS, ENGINES, RNGS };
