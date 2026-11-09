// ============================================================
// MOTOR CRASH PROTEGIDO (usado no jogo normal e no laboratório).
// Princípio: o servidor decide TUDO. O navegador só envia
// "quero começar" e "quero retirar"; nunca valores de resultado.
//
//  Proteções (cada uma tem um teste em tests/):
//   P1  aposta validada (número finito, 2 casas, mínimo, máximo, <= saldo)
//   P2  só uma rodada ativa por jogador (sem rodadas simultâneas)
//   P3  retirada exige o roundId da rodada ativa
//   P4  retirada só vale uma vez (estado running -> cashed)
//   P5  multiplicador é calculado pelo RELÓGIO DO SERVIDOR; o valor
//       enviado pelo navegador é ignorado (só vai para o log)
//   P6  retirada depois da queda é recusada (a aposta já foi perdida)
//   P7  ponto de queda definido no início, ligado a um compromisso
//       (hash) mostrado ao jogador e revelado no fim (verificável)
//   P8  semente vem de gerador criptográfico (imprevisível)
// ============================================================
const crypto = require("crypto");
const { HttpError, round2, MIN_BET, MAX_BET, HISTORY_LIMIT } = require("./common");
const { multiplierAt, crashTimeMs } = require("./multiplier");
const { secureSeedHex, sha256, crashPointFromSeed } = require("./rng");

class SecureCrashEngine {
  /**
   * @param {object} o
   * @param {() => number} [o.now]       relógio (injetável nos testes)
   * @param {(roundId:string) => string} [o.newSeed]   gerador de sementes (hex)
   * @param {(ev:object) => void} [o.onEvent] recebe eventos para log
   */
  constructor({ now = Date.now, newSeed = secureSeedHex, onEvent = () => {} } = {}) {
    this.now = now; this.newSeed = newSeed; this.onEvent = onEvent;
  }

  validateBet(player, bet) {
    if (typeof bet !== "number" || !Number.isFinite(bet)) throw new HttpError(400, "Aposta inválida", { code: "BAD_BET" });
    if (round2(bet) !== bet) throw new HttpError(400, "Use no máximo 2 casas decimais", { code: "BAD_BET" });
    if (bet < MIN_BET || bet > MAX_BET) throw new HttpError(400, `A aposta deve ficar entre ${MIN_BET} e ${MAX_BET}`, { code: "BET_RANGE" });
    if (bet > player.balance) throw new HttpError(400, "Créditos insuficientes", { code: "NO_FUNDS" });
  }

  // Encerra, se for a hora, a rodada em andamento (chamado antes de qualquer operação).
  resolve(player) {
    const r = player.round;
    if (r && r.status === "running" && this.now() - r.startedAt >= r.crashTimeMs) {
      r.status = "crashed"; r.payout = 0; r.cashedAt = null;
      this.pushHistory(player, r);
      this.onEvent({ type: "crash", roundId: r.id, crashPoint: r.crashPoint, bet: r.bet, credited: 0, balanceBefore: player.balance + 0, balanceAfter: player.balance });
      return r;
    }
    return null;
  }

  start(player, bet) {
    this.resolve(player);
    if (player.round && player.round.status === "running") throw new HttpError(409, "Já existe uma rodada em andamento", { code: "ROUND_ACTIVE", roundId: player.round.id });
    this.validateBet(player, bet);

    const id = crypto.randomUUID();
    const serverSeed = this.newSeed(id); // (o id é passado só para os testes poderem escolher uma semente)
    const crashPoint = crashPointFromSeed(serverSeed, id);
    const before = player.balance;
    player.balance = round2(player.balance - bet);
    const round = { id, bet, serverSeed, commit: sha256(serverSeed), crashPoint, crashTimeMs: crashTimeMs(crashPoint), startedAt: this.now(), status: "running", cashedAt: null, payout: 0 };
    player.round = round;
    this.onEvent({ type: "start", roundId: id, bet, commit: round.commit, balanceBefore: before, balanceAfter: player.balance });
    return round;
  }

  cashout(player, roundId, displayedMultiplier) {
    this.resolve(player);
    const r = player.round;
    if (!r || r.id !== roundId) throw new HttpError(404, "Rodada não encontrada", { code: "NO_ROUND" });
    if (r.status === "crashed") throw new HttpError(409, "A rodada já terminou: aposta perdida", { code: "ROUND_ENDED", ...this.reveal(r) });
    if (r.status === "cashed") throw new HttpError(409, "Esta rodada já foi retirada", { code: "ALREADY_CASHED" });

    const elapsed = this.now() - r.startedAt;
    const m = multiplierAt(elapsed);              // P5: multiplicador do servidor
    const before = player.balance;
    r.status = "cashed"; r.cashedAt = m; r.payout = round2(r.bet * m);
    player.balance = round2(player.balance + r.payout);
    this.pushHistory(player, r);
    this.onEvent({ type: "cashout", roundId: r.id, bet: r.bet, claimedMultiplier: displayedMultiplier ?? null, serverMultiplier: m, crashPoint: r.crashPoint, credited: r.payout, balanceBefore: before, balanceAfter: player.balance });
    return r;
  }

  pushHistory(player, r) {
    player.history.unshift({ roundId: r.id, crashPoint: r.crashPoint, bet: r.bet, cashedAt: r.cashedAt, payout: r.payout, status: r.status });
    if (player.history.length > HISTORY_LIMIT) player.history.pop();
  }

  // O que o navegador pode saber. Enquanto a rodada corre: NADA sobre o resultado.
  reveal(r) { return { crashPoint: r.crashPoint, serverSeed: r.serverSeed, commit: r.commit }; }
  view(r) {
    if (!r) return null;
    const base = { roundId: r.id, status: r.status, bet: r.bet, startedAt: r.startedAt, commit: r.commit };
    if (r.status === "running") return base;
    return { ...base, ...this.reveal(r), cashedAt: r.cashedAt, payout: r.payout };
  }
}

module.exports = { SecureCrashEngine };
