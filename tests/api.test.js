// Testes de integração da API (servidor real numa porta livre).  Rodar: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { startServer, fakeClock, forcedSeed } = require("./helpers");
const { multiplierAt } = require("../lib/multiplier");

const far = (c) => c >= 50;
async function setup(extra = {}) {
  const clock = fakeClock();
  const srv = await startServer({ now: clock, schedule: () => {}, newSeed: forcedSeed(far), ...extra });
  const s = (await srv.call("POST", "/api/session")).json;
  return { clock, srv, token: s.token, session: s };
}

test("sessão: entrega token, saldo e configuração do Crash; slot continua funcionando", async () => {
  const { srv, token, session } = await setup();
  assert.equal(session.balance, 1000);
  assert.ok(session.crash.growth > 0 && session.crash.minBet >= 1);
  const sp = await srv.call("POST", "/api/spin", { token, bet: 10 });
  assert.equal(sp.status, 200);
  assert.equal(sp.json.balance, 990 + sp.json.win);
  await srv.close();
});

test("início de rodada: debita, devolve roundId e esconde o resultado", async () => {
  const { srv, token } = await setup();
  const r = await srv.call("POST", "/api/crash/start", { token, bet: 25 });
  assert.equal(r.status, 200);
  assert.equal(r.json.balance, 975);
  assert.equal(r.json.round.status, "running");
  assert.equal(r.json.round.crashPoint, undefined);
  assert.equal(r.json.round.serverSeed, undefined);
  assert.ok(!r.raw.includes("serverSeed"));
  await srv.close();
});

test("retirada: valor vem do servidor, mesmo com multiplicador adulterado no corpo", async () => {
  const { srv, token, clock } = await setup();
  const st = await srv.call("POST", "/api/crash/start", { token, bet: 10 });
  clock.advance(4000);
  const c = await srv.call("POST", "/api/crash/cashout", { token, roundId: st.json.round.roundId, displayedMultiplier: 1e9, multiplier: 1e9, payout: 1e9 });
  assert.equal(c.status, 200);
  assert.equal(c.json.multiplier, multiplierAt(4000));
  assert.equal(c.json.payout, Math.round(10 * multiplierAt(4000) * 100) / 100);
  assert.equal(c.json.balance, Math.round((990 + c.json.payout) * 100) / 100);
  assert.equal(c.json.round.status, "cashed");
  assert.equal(c.json.history[0].status, "cashed");
  await srv.close();
});

test("encerramento: retirar depois da queda é recusado e o saldo fica igual", async () => {
  const { srv, token, clock } = await setup({ newSeed: forcedSeed((c) => c >= 2 && c <= 3) });
  // (a sessão já foi criada em setup; precisamos do mesmo servidor com sementes baixas)
  const st = await srv.call("POST", "/api/crash/start", { token, bet: 10 });
  clock.advance(60000);
  const c = await srv.call("POST", "/api/crash/cashout", { token, roundId: st.json.round.roundId });
  assert.equal(c.status, 409);
  assert.equal(c.json.code, "ROUND_ENDED");
  assert.ok(c.json.crashPoint >= 2 && c.json.crashPoint <= 3);
  const s2 = await srv.call("GET", `/api/crash/state?token=${token}`);
  assert.equal(s2.json.balance, 990);
  assert.equal(s2.json.history[0].status, "crashed");
  await srv.close();
});

test("concorrência: duas inicializações simultâneas -> só uma passa", async () => {
  const { srv, token } = await setup();
  const rs = await Promise.all([1, 2, 3].map(() => srv.call("POST", "/api/crash/start", { token, bet: 10 })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
  const st = await srv.call("GET", `/api/crash/state?token=${token}`);
  assert.equal(st.json.balance, 990); // só uma aposta debitada
  await srv.close();
});

test("concorrência: várias retiradas simultâneas -> credita uma única vez", async () => {
  const { srv, token, clock } = await setup();
  const st = await srv.call("POST", "/api/crash/start", { token, bet: 10 });
  clock.advance(3000);
  const rs = await Promise.all(Array.from({ length: 6 }, () => srv.call("POST", "/api/crash/cashout", { token, roundId: st.json.round.roundId })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 5);
  const bal = (await srv.call("GET", `/api/crash/state?token=${token}`)).json.balance;
  assert.equal(bal, Math.round((990 + 10 * multiplierAt(3000)) * 100) / 100);
  await srv.close();
});

test("requisições fora de ordem ou inválidas são recusadas", async () => {
  const { srv, token } = await setup();
  assert.equal((await srv.call("POST", "/api/crash/cashout", { token, roundId: "nao-existe" })).status, 404); // sem rodada
  assert.equal((await srv.call("POST", "/api/crash/cashout", { token })).status, 400);                         // sem roundId
  assert.equal((await srv.call("POST", "/api/crash/start", { token, bet: -10 })).status, 400);
  assert.equal((await srv.call("POST", "/api/crash/start", { token, bet: "10" })).status, 400);
  assert.equal((await srv.call("POST", "/api/crash/start", { token, bet: 999999 })).status, 400);
  assert.equal((await srv.call("POST", "/api/crash/start", { token: "abc", bet: 10 })).status, 404);
  assert.equal((await srv.call("POST", "/api/crash/start", { bet: 10 })).status, 404);
  assert.equal((await srv.call("GET", "/api/crash/state?token=00000000-0000-4000-8000-000000000000")).status, 404);
  assert.equal((await srv.call("GET", "/api/crash/start")).status, 404);
  assert.equal((await srv.call("GET", "/api/nao-existe")).status, 404);
  assert.equal((await srv.call("GET", `/api/crash/state?token=${token}`)).json.balance, 1000);
  await srv.close();
});

test("falhas de comunicação: JSON quebrado, corpo não-objeto e corpo gigante", async () => {
  const { srv, token } = await setup();
  assert.equal((await srv.call("POST", "/api/crash/start", undefined, "{ quebrado")).status, 400);
  assert.equal((await srv.call("POST", "/api/crash/start", undefined, "[1,2]")).status, 400);
  assert.equal((await srv.call("POST", "/api/crash/start", undefined, "null")).status, 400);
  let outcome;
  try { outcome = (await srv.call("POST", "/api/crash/start", undefined, JSON.stringify({ token, bet: 10, lixo: "x".repeat(50000) }))).status; }
  catch { outcome = "conexão encerrada"; }
  assert.ok(outcome === 413 || outcome === "conexão encerrada", String(outcome));
  // o servidor continua de pé e o saldo intacto
  assert.equal((await srv.call("GET", `/api/crash/state?token=${token}`)).json.balance, 1000);
  await srv.close();
});

test("falhas de comunicação: cliente que abre o stream SSE e some não derruba o servidor", async () => {
  const { srv, token } = await setup();
  await new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: srv.port, path: `/api/crash/stream?token=${token}` }, (res) => {
      assert.match(res.headers["content-type"], /text\/event-stream/);
      res.once("data", () => { req.destroy(); resolve(); });
    });
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(srv.players.get(token).sse.size, 0);
  assert.equal((await srv.call("GET", `/api/crash/state?token=${token}`)).status, 200);
  await srv.close();
});

test("SSE: o servidor avisa a queda sozinho (timer real) e revela semente/queda", async () => {
  const srv = await startServer({ newSeed: forcedSeed((c) => c >= 1.01 && c <= 1.06) });
  const token = (await srv.call("POST", "/api/session")).json.token;
  const got = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("sem evento de queda")), 3000);
    http.get({ host: "127.0.0.1", port: srv.port, path: `/api/crash/stream?token=${token}` }, (res) => {
      let buf = "";
      res.on("data", async (d) => {
        buf += d;
        if (buf.includes("event: hello") && !buf.includes("started")) { buf += "started"; srv.call("POST", "/api/crash/start", { token, bet: 10 }); }
        const m = buf.match(/event: crash\ndata: (.*)\n/);
        if (m) { clearTimeout(to); res.destroy(); resolve(JSON.parse(m[1])); }
      });
    });
  });
  const ev = await got;
  assert.equal(ev.status, "crashed");
  assert.ok(ev.crashPoint >= 1.01 && ev.crashPoint <= 1.06);
  assert.match(ev.serverSeed, /^[0-9a-f]{64}$/);
  await srv.close();
});

test("reiniciar saldo é bloqueado durante uma rodada ativa", async () => {
  const { srv, token } = await setup();
  await srv.call("POST", "/api/crash/start", { token, bet: 10 });
  assert.equal((await srv.call("POST", "/api/reset", { token })).status, 409);
  await srv.close();
});

test("arquivos estáticos: Crash em /, slot em /slot.html, e bloqueio de path traversal", async () => {
  const { srv } = await setup();
  const home = await srv.call("GET", "/");
  assert.equal(home.status, 200); assert.match(home.raw, /Crash/i);
  assert.equal((await srv.call("GET", "/slot.html")).status, 200);
  assert.equal((await srv.call("GET", "/lab.html")).status, 200);
  for (const p of ["/../server.js", "/%2e%2e/server.js", "/..%2fserver.js", "/%2e%2e%2f%2e%2e%2fetc/passwd"]) {
    const r = await srv.call("GET", p);
    assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.raw.includes("createApp"), p);
  }
  await srv.close();
});

test("o laboratório é isolado: não altera o saldo do jogo normal", async () => {
  const { srv, token } = await setup();
  const lab = (await srv.call("POST", "/api/lab/session")).json;
  const r = await srv.call("POST", "/api/lab/start", { token: lab.token, engine: "vulnerable", rng: "secure", bet: -900 });
  assert.equal(r.status, 200); assert.equal(r.json.test, true);
  assert.equal((await srv.call("GET", `/api/state?token=${token}`)).json.balance, 1000);
  assert.equal((await srv.call("POST", "/api/crash/start", { token: lab.token, bet: 10 })).status, 404); // token do lab não vale no jogo
  await srv.close();
});
