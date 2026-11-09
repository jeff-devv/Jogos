// ============================================================
// !!!  MOTOR CRASH PROPOSITALMENTE VULNERÁVEL  !!!
// SOMENTE PARA O LABORATÓRIO ACADÊMICO (créditos fictícios).
// Nunca é usado no jogo normal (/api/crash/*): ele só é alcançado por
// /api/lab/*, que tem saldos separados e rodadas marcadas como TESTE.
//
// Cada falha abaixo é um erro comum de projeto, marcado como FALHA #n.
// Compare linha a linha com lib/crash-secure.js (as proteções P1..P8).
// ============================================================
const crypto = require("crypto");
const { round2, HISTORY_LIMIT } = require("./common");
const { multiplierAt, crashTimeMs } = require("./multiplier");
const { crashFromFloat } = require("./rng");

class VulnerableCrashEngine {
  /**
   * @param {() => number} nextFloat  fonte dos sorteios (fraca ou segura, escolhida no laboratório)
   */
  constructor({ now = Date.now, nextFloat, onEvent = () => {} }) {
    this.now = now; this.nextFloat = nextFloat; this.onEvent = onEvent;
  }

  start(player, bet) {
    // FALHA #1: a aposta não é validada. Valor negativo, texto, maior que o saldo...
    //           "debitar" um valor negativo AUMENTA o saldo.
    // FALHA #2: não verifica se já existe rodada ativa (várias rodadas ao mesmo tempo).
    player.rounds = player.rounds || new Map();
    const id = crypto.randomUUID();
    const crashPoint = crashFromFloat(this.nextFloat());   // FALHA #3 (se o gerador for fraco): resultado previsível
    const before = player.balance;
    player.balance = round2(player.balance - bet);
    const round = { id, bet, crashPoint, crashTimeMs: crashTimeMs(crashPoint), startedAt: this.now(), status: "running", payout: 0 };
    player.rounds.set(id, round);
    player.lastRoundId = id;
    this.onEvent({ type: "start", roundId: id, bet, balanceBefore: before, balanceAfter: player.balance });
    return round;
  }

  cashout(player, roundId, claimedMultiplier) {
    const r = player.rounds && player.rounds.get(roundId);
    if (!r) return null;
    // FALHA #4: confia no multiplicador enviado pelo navegador (basta editar a requisição).
    // FALHA #5: não confere se a rodada já caiu (retirada depois do fim é aceita).
    // FALHA #6: não marca a rodada como paga: repetir a requisição paga de novo (replay).
    const m = Number(claimedMultiplier);
    const serverM = multiplierAt(this.now() - r.startedAt);
    const before = player.balance;
    const payout = round2(r.bet * m);
    player.balance = round2(player.balance + payout);
    r.status = "cashed"; r.payout = payout;
    this.pushHistory(player, r, m);
    this.onEvent({ type: "cashout", roundId, bet: r.bet, claimedMultiplier: m, serverMultiplier: serverM, crashPoint: this.isOver(r) ? r.crashPoint : null, credited: payout, balanceBefore: before, balanceAfter: player.balance });
    return r;
  }

  isOver(r) { return this.now() - r.startedAt >= r.crashTimeMs; }

  pushHistory(player, r, cashedAt) {
    player.history.unshift({ roundId: r.id, crashPoint: this.isOver(r) ? r.crashPoint : null, bet: r.bet, cashedAt, payout: r.payout, status: r.status });
    if (player.history.length > HISTORY_LIMIT) player.history.pop();
  }

  // Quando a rodada termina o ponto de queda fica público (como em qualquer jogo):
  // é essa observação que permite atacar um gerador fraco.
  view(r) {
    if (!r) return null;
    const over = this.isOver(r);
    return { roundId: r.id, status: r.status, bet: r.bet, startedAt: r.startedAt, ...(over ? { crashPoint: r.crashPoint } : {}) };
  }
}

module.exports = { VulnerableCrashEngine };
