// Testes do motor Crash protegido (unidade, com relógio falso).  Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { SecureCrashEngine } = require("../lib/crash-secure");
const { multiplierAt, crashTimeMs } = require("../lib/multiplier");
const { crashFromFloat, secureFloat, sha256, crashPointFromSeed, EDGE } = require("../lib/rng");
const { HttpError } = require("../lib/common");
const { fakeClock, forcedSeed } = require("./helpers");

const mk = (pred = () => true) => {
  const now = fakeClock();
  const events = [];
  const eng = new SecureCrashEngine({ now, newSeed: forcedSeed(pred), onEvent: (e) => events.push(e) });
  const player = { balance: 1000, round: null, history: [] };
  return { now, eng, player, events };
};
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof HttpError); return e.extra.code; } assert.fail("deveria ter falhado"); };

test("curva: começa em 1.00x, cresce e respeita o teto", () => {
  assert.equal(multiplierAt(0), 1);
  assert.equal(multiplierAt(-5), 1);
  assert.ok(multiplierAt(5000) > 2 && multiplierAt(5000) < 2.1);
  assert.ok(multiplierAt(1e9) <= 1000);
  assert.ok(multiplierAt(10000) >= multiplierAt(9999));
});

test("início de rodada: debita a aposta e NÃO revela o resultado", () => {
  const { eng, player } = mk();
  const r = eng.start(player, 10);
  assert.equal(player.balance, 990);
  const v = eng.view(r);
  assert.equal(v.status, "running");
  assert.equal(v.crashPoint, undefined);
  assert.equal(v.serverSeed, undefined);
  assert.match(v.commit, /^[0-9a-f]{64}$/);
});

test("retirada a tempo: paga aposta x multiplicador do SERVIDOR e atualiza saldo/histórico", () => {
  const { now, eng, player } = mk((c) => c >= 50);
  const r = eng.start(player, 10);
  now.advance(5000);
  const done = eng.cashout(player, r.id, 999); // 999 = "multiplicador do navegador" deve ser ignorado
  assert.equal(done.cashedAt, multiplierAt(5000));
  assert.equal(done.payout, Math.round(10 * multiplierAt(5000) * 100) / 100);
  assert.equal(player.balance, Math.round((990 + done.payout) * 100) / 100);
  assert.equal(player.history[0].status, "cashed");
});

test("encerramento: sem retirada a aposta é perdida e o histórico registra a queda", () => {
  const { now, eng, player } = mk((c) => c >= 2 && c <= 2.5);
  const r = eng.start(player, 10);
  now.advance(crashTimeMs(r.crashPoint) + 1);
  eng.resolve(player);
  assert.equal(player.round.status, "crashed");
  assert.equal(player.balance, 990);
  assert.equal(player.history[0].status, "crashed");
  assert.equal(player.history[0].crashPoint, r.crashPoint);
});

test("não retira depois do encerramento (P6) e o saldo não muda", () => {
  const { now, eng, player } = mk((c) => c >= 2 && c <= 2.5);
  const r = eng.start(player, 10);
  now.advance(crashTimeMs(r.crashPoint) + 1);
  assert.equal(code(() => eng.cashout(player, r.id)), "ROUND_ENDED");
  assert.equal(player.balance, 990);
});

test("rodada que cai em 1.00x não permite retirar", () => {
  const { eng, player } = mk((c) => c === 1);
  const r = eng.start(player, 10);
  assert.equal(code(() => eng.cashout(player, r.id)), "ROUND_ENDED");
});

test("não retira duas vezes (P4)", () => {
  const { now, eng, player } = mk((c) => c >= 50);
  const r = eng.start(player, 10);
  now.advance(3000);
  eng.cashout(player, r.id);
  const bal = player.balance;
  assert.equal(code(() => eng.cashout(player, r.id)), "ALREADY_CASHED");
  assert.equal(player.balance, bal);
});

test("não inicia duas rodadas simultâneas (P2)", () => {
  const { eng, player } = mk((c) => c >= 50);
  eng.start(player, 10);
  assert.equal(code(() => eng.start(player, 10)), "ROUND_ACTIVE");
  assert.equal(player.balance, 990);
});

test("retirada com roundId errado ou sem rodada é recusada (P3)", () => {
  const { eng, player } = mk((c) => c >= 50);
  assert.equal(code(() => eng.cashout(player, "x")), "NO_ROUND");
  eng.start(player, 10);
  assert.equal(code(() => eng.cashout(player, "outro-id")), "NO_ROUND");
});

test("validação da aposta (P1): negativa, zero, NaN, texto, 3 casas, acima do saldo/limite", () => {
  const { eng, player } = mk();
  for (const bad of [-5, 0, NaN, Infinity, "10", null, undefined, 10.123, 0.5, 5000]) assert.ok(code(() => eng.start(player, bad)), String(bad));
  player.balance = 5;
  assert.equal(code(() => eng.start(player, 10)), "NO_FUNDS");
  assert.equal(player.balance, 5);
  assert.equal(player.round, null);
});

test("depois de terminar (retirada ou queda) é possível iniciar nova rodada", () => {
  const { now, eng, player } = mk((c) => c >= 50);
  const r = eng.start(player, 10); now.advance(2000); eng.cashout(player, r.id);
  assert.ok(eng.start(player, 10));
});

test("compromisso/revelação (P7): sha256(semente) = commit e a queda é recalculável", () => {
  const { now, eng, player } = mk();
  const r = eng.start(player, 10);
  const commit = eng.view(r).commit;
  now.advance(crashTimeMs(r.crashPoint) + 5);
  eng.resolve(player);
  const v = eng.view(player.round);
  assert.equal(sha256(v.serverSeed), commit);
  assert.equal(crashPointFromSeed(v.serverSeed, v.roundId), v.crashPoint);
});

test("eventos de log: início, retirada com multiplicador alegado x do servidor", () => {
  const { now, eng, player, events } = mk((c) => c >= 50);
  const r = eng.start(player, 10); now.advance(4000); eng.cashout(player, r.id, 77);
  const c = events.find((e) => e.type === "cashout");
  assert.equal(c.claimedMultiplier, 77);
  assert.equal(c.serverMultiplier, multiplierAt(4000));
  assert.ok(c.credited < 77 * 10);
});

test("RTP: qualquer estratégia retorna ~96% (vantagem da casa 4%)", () => {
  for (const target of [1.5, 2, 5]) {
    let paid = 0; const N = 300000;
    for (let i = 0; i < N; i++) if (crashFromFloat(secureFloat()) >= target) paid += target;
    const rtp = paid / N;
    assert.ok(Math.abs(rtp - (1 - EDGE)) < 0.03, `alvo ${target}x: RTP ${rtp}`);
  }
});
