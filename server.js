// ============================================================
// SERVIDOR (sem dependências: usa só módulos do próprio Node).
// Guarda saldos e decide TODOS os resultados. O navegador só mostra.
//
//  Slot (já existia, mantido):  /api/session /api/state /api/spin /api/reset
//  Crash (novo):                /api/crash/start|cashout|state|stream
//  Laboratório (novo, isolado): /api/lab/*
//
//  Com "wallet" (MySQL) o login e o saldo são os MESMOS do login.php / admin:
//    POST /api/login  -> {token}      POST /api/session {token} -> saldo/config
//  Sem "wallet" (NO_DB=1 ou nos testes) tudo funciona em memória, como antes.
// ============================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { BETS, spin, SYMBOLS } = require("./game");
const { HttpError, MIN_BET, MAX_BET } = require("./lib/common");
const { SecureCrashEngine } = require("./lib/crash-secure");
const { Lab } = require("./lib/lab");
const { GROWTH, MAX_MULT } = require("./lib/multiplier");
const { EDGE } = require("./lib/rng");

// Páginas do Crash/Laboratório servidas pelo Node (o site PHP fica no Apache: /lucky-charm/public/)
const PUBLIC = path.join(__dirname, "public", "jogos", "crash", "public");
const START_CREDITS = 1000;
const MAX_PLAYERS = 1000;
const MAX_BODY = 10000;
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
};

function send(res, code, data, extraHeaders = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders });
  res.end(JSON.stringify(data));
}

// Lê o corpo JSON com limite de tamanho. Devolve {} se vazio; lança 400/413 se inválido.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ""; let tooBig = false;
    req.on("data", (c) => { raw += c; if (raw.length > MAX_BODY) { tooBig = true; req.destroy(); } });
    req.on("error", () => reject(new HttpError(400, "Falha ao ler a requisição")));
    req.on("close", () => { if (tooBig) reject(new HttpError(413, "Corpo grande demais")); });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        const v = JSON.parse(raw);
        if (v === null || typeof v !== "object" || Array.isArray(v)) return reject(new HttpError(400, "JSON inválido"));
        resolve(v);
      } catch { reject(new HttpError(400, "JSON inválido")); }
    });
  });
}

/**
 * Cria a aplicação. Tudo que é "tempo" ou "agendamento" pode ser injetado,
 * para os testes controlarem o relógio sem nenhum atalho escondido no jogo.
 */
function createApp({ now = Date.now, schedule = setTimeout, labLogFile, newSeed, wallet = null } = {}) {
  const players = new Map(); // token -> { balance, round, history, sse }
  const engine = new SecureCrashEngine({ now, ...(newSeed ? { newSeed } : {}) });
  const lab = new Lab({ now, ...(labLogFile !== undefined ? { logFile: labLogFile } : {}) });

  const memPlayer = (token) => {
    const p = typeof token === "string" && TOKEN_RE.test(token) ? players.get(token) : undefined;
    if (!p) throw new HttpError(404, "Sessão não encontrada. Recarregue a página.", { code: "NO_SESSION" });
    return p;
  };

  // Com carteira: o jogador é quem fez login (token do banco) e o saldo vem do MySQL a cada
  // requisição. Aqui só fica o estado da rodada (a rodada em si nunca vai para o banco).
  const walletPlayers = new Map(); // userId -> { round, history, sse }
  const getPlayer = async (token) => {
    if (!wallet) return memPlayer(token);
    const u = await wallet.authUser(token);
    if (!u) throw new HttpError(401, "Sessão inválida. Faça login novamente.", { code: "NO_SESSION" });
    let p = walletPlayers.get(u.id);
    if (!p) { p = { round: null, history: [], sse: new Set() }; walletPlayers.set(u.id, p); }
    p.userId = u.id;
    p.balance = Number(u.balance) / 100;
    p.username = u.username;
    return p;
  };
  // Grava no banco a diferença de saldo que a operação causou (créditos -> centavos).
  // Crédito tenta 3 vezes (não pode se perder); débito devolve false se faltar saldo.
  const persist = async (pl, before) => {
    if (!wallet) return true;
    const delta = Math.round((pl.balance - before) * 100);
    if (delta === 0) return true;
    for (let i = 0; ; i++) {
      try { return await wallet.apply(pl.userId, delta); }
      catch (e) { if (delta < 0 || i >= 2) { console.error("FALHA AO GRAVAR SALDO", { userId: pl.userId, delta }, e); throw new HttpError(500, "Erro ao gravar o saldo"); } }
    }
  };
  const logRound = (pl, r) => {
    if (wallet && r) wallet.logRound(pl.userId, r, pl.balance).catch((e) => console.error("crash_rounds:", e.message));
  };

  const sseSend = (player, event, data) => {
    for (const res of player.sse) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Encerra (se for a hora) a rodada e avisa o navegador por SSE.
  const settle = (player) => {
    const r = engine.resolve(player);
    if (r) { sseSend(player, "crash", engine.view(r)); logRound(player, r); }
    return r;
  };

  async function api(req, res, url) {
    const m = req.method, p = url.pathname;

    // ---------------- sessão / slot (existente) ----------------
    if (wallet && m === "POST" && p === "/api/login") {
      const b = await readBody(req);
      const token = await wallet.login(String(b.username || "").trim(), String(b.password || ""));
      if (!token) throw new HttpError(401, "Usuário ou senha incorretos");
      return send(res, 200, { token });
    }
    if (m === "POST" && p === "/api/session") {
      let token, balance, username = null;
      if (wallet) {                       // sessão já criada pelo login: só devolve saldo e config
        const b = await readBody(req);
        const pl = await getPlayer(b.token);
        token = b.token; balance = pl.balance; username = pl.username;
      } else {
        if (players.size >= MAX_PLAYERS) players.delete(players.keys().next().value);
        token = crypto.randomUUID(); balance = START_CREDITS;
        players.set(token, { balance, round: null, history: [], sse: new Set() });
      }
      return send(res, 200, {
        token, balance, username, mode: wallet ? "mysql" : "memory", bets: BETS, symbols: SYMBOLS.map((s) => ({ icon: s.icon, pay: s.pay })),
        crash: { growth: GROWTH, maxMult: MAX_MULT, minBet: MIN_BET, maxBet: MAX_BET, edge: EDGE },
      });
    }
    if (m === "GET" && p === "/api/state") {
      const pl = await getPlayer(url.searchParams.get("token"));
      return send(res, 200, { balance: pl.balance });
    }
    if (m === "POST" && p === "/api/spin") {
      const body = await readBody(req);
      const pl = await getPlayer(body.token);
      const bet = Number(body.bet);
      if (!BETS.includes(bet)) throw new HttpError(400, "Aposta inválida");
      if (pl.balance < bet) throw new HttpError(400, "Créditos insuficientes");
      const before = pl.balance;
      pl.balance -= bet;            // 1) cobra a aposta
      const result = spin(bet);     // 2) sorteia no servidor
      pl.balance += result.win;     // 3) paga o prêmio, se houver
      pl.balance = Math.round(pl.balance * 100) / 100;
      if (!(await persist(pl, before))) throw new HttpError(400, "Créditos insuficientes");
      return send(res, 200, { ...result, balance: pl.balance });
    }
    if (m === "POST" && p === "/api/reset") {
      const body = await readBody(req);
      const pl = await getPlayer(body.token);
      if (wallet) throw new HttpError(403, "Reiniciar saldo está desativado: peça crédito ao administrador.");
      settle(pl);
      if (pl.round && pl.round.status === "running") throw new HttpError(409, "Termine a rodada antes de reiniciar", { code: "ROUND_ACTIVE" });
      pl.balance = START_CREDITS;
      return send(res, 200, { balance: pl.balance });
    }

    // ---------------- CRASH (jogo normal, motor protegido) ----------------
    if (m === "POST" && p === "/api/crash/start") {
      const body = await readBody(req);
      const pl = await getPlayer(body.token);
      const before = pl.balance;
      const r = engine.start(pl, body.bet);
      if (!(await persist(pl, before))) {   // o saldo no banco mudou (slot/admin) entre a leitura e o débito
        pl.round = null; pl.balance = before;
        throw new HttpError(400, "Créditos insuficientes", { code: "NO_FUNDS" });
      }
      // agenda o aviso de queda (SSE); a regra de queda NÃO depende deste timer
      schedule(() => settle(pl), r.crashTimeMs + 20);
      return send(res, 200, { balance: pl.balance, round: engine.view(r), serverNow: now() });
    }
    if (m === "POST" && p === "/api/crash/cashout") {
      const body = await readBody(req);
      const pl = await getPlayer(body.token);
      if (typeof body.roundId !== "string") throw new HttpError(400, "roundId obrigatório");
      const before = pl.balance;
      const r = engine.cashout(pl, body.roundId, typeof body.displayedMultiplier === "number" ? body.displayedMultiplier : undefined);
      await persist(pl, before);            // credita o prêmio no banco
      logRound(pl, r);
      return send(res, 200, { outcome: "cashed", multiplier: r.cashedAt, payout: r.payout, balance: pl.balance, round: engine.view(r), history: pl.history });
    }
    if (m === "GET" && p === "/api/crash/state") {
      const pl = await getPlayer(url.searchParams.get("token"));
      settle(pl);
      return send(res, 200, { balance: pl.balance, round: engine.view(pl.round), history: pl.history, serverNow: now() });
    }
    if (m === "GET" && p === "/api/crash/stream") {
      const pl = await getPlayer(url.searchParams.get("token"));
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 1500\nevent: hello\ndata: {}\n\n");
      pl.sse.add(res);
      const hb = setInterval(() => res.write(": ping\n\n"), 15000);
      req.on("close", () => { clearInterval(hb); pl.sse.delete(res); });
      return; // conexão fica aberta
    }

    // ---------------- LABORATÓRIO (isolado, só créditos de teste) ----------------
    if (p.startsWith("/api/lab/")) {
      if (m === "POST" && p === "/api/lab/session") {
        const s = lab.createSession();
        return send(res, 200, { token: s.token, createdAt: s.createdAt, test: true, credits: 1000, engines: ["vulnerable", "secure"], rngs: ["weak", "secure"] });
      }
      if (m === "POST" && p === "/api/lab/start") {
        const b = await readBody(req);
        return send(res, 200, lab.start(b.token, b.engine, b.rng, b.bet));
      }
      if (m === "POST" && p === "/api/lab/cashout") {
        const b = await readBody(req);
        return send(res, 200, lab.cashout(b.token, b.engine, b.rng, b.roundId, b.multiplier));
      }
      if (m === "POST" && p === "/api/lab/reset") {
        const b = await readBody(req);
        return send(res, 200, lab.reset(b.token, b.engine, b.rng));
      }
      if (m === "GET" && p === "/api/lab/state") {
        const q = url.searchParams;
        return send(res, 200, lab.state(q.get("token"), q.get("engine"), q.get("rng")));
      }
      if (m === "GET" && p === "/api/lab/log") {
        return send(res, 200, { log: lab.session(url.searchParams.get("token")).log });
      }
      if (m === "GET" && p === "/api/lab/export.csv") {
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=lab-eventos.csv", "Cache-Control": "no-store" });
        return res.end("﻿" + lab.csv(url.searchParams.get("token")));
      }
    }

    throw new HttpError(404, "Rota não encontrada");
  }

  function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end("Método não permitido"); }
    let rel;
    try { rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, ""); }
    catch { res.writeHead(400); return res.end("Requisição inválida"); }
    // tema.css fica no site (public/); as páginas pedem "../../../tema.css", que aqui vira /tema.css
    const file = rel === "tema.css" ? path.join(__dirname, "public", "tema.css") : path.normalize(path.join(PUBLIC, rel));
    if (rel !== "tema.css" && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Proibido"); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Não encontrado"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    // CORS: as páginas ficam no Apache (outra porta). Só aceita origens locais.
    const origin = req.headers.origin;
    if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (url.pathname.startsWith("/api/")) {
      return api(req, res, url).catch((e) => {
        if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
        console.error(e);
        send(res, 500, { error: "Erro interno" });
      });
    }
    serveStatic(req, res, url);
  });

  return { server, players, engine, lab };
}

module.exports = { createApp };

if (require.main === module) {
  const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  const HOST = process.env.HOST || "127.0.0.1"; // só este computador (o laboratório não deve ficar exposto na rede)
  // NO_DB=1 roda como antes (saldo em memória, sem login). Padrão: usa o MySQL do projeto.
  const wallet = process.env.NO_DB ? null : require("./lib/wallet").createWallet();
  const { server } = createApp({ wallet });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") console.error(`\nA porta ${PORT} já está em uso. Feche o outro programa ou use outra porta.\n`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`\n  Lucky Charm Demo rodando em http://localhost:${server.address().port}`);
    console.log("  Pasta servida: " + PUBLIC);
    console.log("  Arquivo do servidor: " + __filename);
    console.log(wallet ? "  Modo: MySQL (login e saldo compartilhados com o PHP)" : "  Modo: memória (NO_DB=1) — sem login");
    console.log("    Crash:       /            Laboratório: /lab.html            Slot: /slot.html");
    console.log("  (deixe esta janela aberta; Ctrl+C para parar)\n");
  });
}
