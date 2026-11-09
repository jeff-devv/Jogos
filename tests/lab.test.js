// Experimento: ataques x implementação vulnerável x protegida.  Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, fakeClock } = require("./helpers");
const A = require("../lab/attacks");

async function harness() {
  const clock = fakeClock();
  const srv = await startServer({ now: clock, schedule: () => {} });
  return { call: srv.call, clock, srv };
}

test("A1 adulterar multiplicador: vulnerável paga 1000x; protegido ignora", async () => {
  const h = await harness();
  const v = await A.tamperMultiplier(h, "vulnerable");
  const s = await A.tamperMultiplier(h, "secure");
  assert.equal(v.credited, 10000);            // 10 x 1000
  assert.ok(v.profit > 9000);
  assert.ok(s.credited <= 10.01);             // só 1.00x (retirada imediata)
  assert.ok(s.profit <= 0.01);
  await h.srv.close();
});

test("A2 replay da retirada: vulnerável paga várias vezes; protegido só uma", async () => {
  const h = await harness();
  const v = await A.replayCashout(h, "vulnerable");
  const s = await A.replayCashout(h, "secure");
  assert.equal(v.accepted, 5);
  assert.equal(s.accepted, 1);
  assert.deepEqual(s.statuses, [200, 409, 409, 409, 409]);
  assert.ok(v.profit > s.profit);
  await h.srv.close();
});

test("A3 retirada depois da queda: vulnerável paga; protegido recusa", async () => {
  const h = await harness();
  const v = await A.lateCashout(h, "vulnerable");
  const s = await A.lateCashout(h, "secure");
  assert.equal(v.status, 200); assert.equal(v.credited, 20); assert.equal(v.profit, 10);
  assert.equal(s.status, 409); assert.equal(s.code, "ROUND_ENDED"); assert.equal(s.profit, -10);
  await h.srv.close();
});

test("A4 aposta negativa: vulnerável ganha saldo; protegido recusa", async () => {
  const h = await harness();
  const v = await A.negativeBet(h, "vulnerable");
  const s = await A.negativeBet(h, "secure");
  assert.equal(v.status, 200); assert.equal(v.profit, 500);
  assert.equal(s.status, 400); assert.equal(s.profit, 0);
  await h.srv.close();
});

test("A5 rodadas simultâneas: vulnerável aceita; protegido recusa a segunda", async () => {
  const h = await harness();
  const v = await A.parallelRounds(h, "vulnerable");
  const s = await A.parallelRounds(h, "secure");
  assert.deepEqual([v.first, v.second], [200, 200]);
  assert.deepEqual([s.first, s.second], [200, 409]);
  await h.srv.close();
});

test("A6 gerador previsível (semente = relógio): a semente é descoberta e o atacante lucra", async () => {
  const h = await harness();
  const v = await A.predictRng(h, "vulnerable", "weak");
  const s = await A.predictRng(h, "secure", "weak");   // mesmo com compromisso/revelação!
  assert.equal(v.seedFound, true); assert.ok(v.net > 0, `vuln net ${v.net}`);
  assert.equal(s.seedFound, true); assert.ok(s.net > 0, `secure+weak net ${s.net}`);
  await h.srv.close();
});

test("A6 gerador criptográfico: a semente NÃO é encontrada e não há previsão", async () => {
  const h = await harness();
  const v = await A.predictRng(h, "vulnerable", "secure");
  const s = await A.predictRng(h, "secure", "secure");
  assert.equal(v.seedFound, false);
  assert.equal(s.seedFound, false);
  await h.srv.close();
});

test("log do laboratório: eventos marcados como TESTE, com multiplicador alegado x servidor x creditado", async () => {
  const h = await harness();
  const lab = (await h.call("POST", "/api/lab/session")).json;
  const st = await h.call("POST", "/api/lab/start", { token: lab.token, engine: "vulnerable", rng: "secure", bet: 10 });
  await h.call("POST", "/api/lab/cashout", { token: lab.token, engine: "vulnerable", rng: "secure", roundId: st.json.round.roundId, multiplier: 50 });
  // rodada protegida: repete até uma rodada não cair logo no início (4% caem em 1.00x)
  let st2, ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    st2 = await h.call("POST", "/api/lab/start", { token: lab.token, engine: "secure", rng: "secure", bet: 10 });
    h.clock.advance(100);
    ok = (await h.call("POST", "/api/lab/cashout", { token: lab.token, engine: "secure", rng: "secure", roundId: st2.json.round.roundId, multiplier: 50 })).status === 200;
  }
  assert.ok(ok);
  await h.call("POST", "/api/lab/cashout", { token: lab.token, engine: "secure", rng: "secure", roundId: st2.json.round.roundId, multiplier: 50 });
  const log = (await h.call("GET", `/api/lab/log?token=${lab.token}`)).json.log;
  assert.ok(log.every((e) => e.mode === "TESTE"));
  const cv = log.find((e) => e.engine === "vulnerable" && e.type === "cashout");
  assert.equal(cv.claimedMultiplier, 50); assert.equal(cv.credited, 500); assert.ok(cv.serverMultiplier < 2);
  const cs = log.find((e) => e.engine === "secure" && e.type === "cashout");
  assert.ok(cs, "retirada protegida registrada");
  assert.equal(cs.claimedMultiplier, 50); assert.ok(cs.credited < 20);
  assert.ok(log.some((e) => e.type === "cashout_rejected" && e.reason === "ALREADY_CASHED"));
  const csv = (await h.call("GET", `/api/lab/export.csv?token=${lab.token}`));
  assert.equal(csv.status, 200); assert.match(csv.raw, /claimedMultiplier/);
  await h.srv.close();
});
