const http = require("http");
const { createApp } = require("../server");
const { crashPointFromSeed, secureSeedHex } = require("../lib/rng");

// relógio falso controlável
function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

// gerador de sementes que força o ponto de queda desejado (cresce até achar uma semente que sirva)
function forcedSeed(pred) {
  return (roundId) => {
    for (let i = 0; i < 200000; i++) { const s = secureSeedHex(); if (pred(crashPointFromSeed(s, roundId))) return s; }
    throw new Error("semente não encontrada");
  };
}

// sobe o servidor numa porta livre e devolve um cliente HTTP simples
async function startServer(opts = {}) {
  const app = createApp({ labLogFile: null, ...opts });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  app.server.unref(); // um teste que falha não deixa o processo preso
  const port = app.server.address().port;
  const call = (method, path, body, rawBody) => new Promise((resolve, reject) => {
    const data = rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request({ host: "127.0.0.1", port, path, method, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
      let raw = ""; res.on("data", (c) => (raw += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(raw); } catch {} resolve({ status: res.statusCode, json, raw, headers: res.headers }); });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
  const close = () => new Promise((r) => { app.server.closeAllConnections?.(); app.server.close(r); });
  return { ...app, port, call, close };
}

module.exports = { fakeClock, forcedSeed, startServer, crashPointFromSeed };
