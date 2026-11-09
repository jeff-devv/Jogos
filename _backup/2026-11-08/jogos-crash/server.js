
// ============================================================
// SERVIDOR (sem dependências: usa módulos nativos do Node.js).
// O servidor controla as rodadas e integra o saldo ao MySQL.
//
// Slot:
//   /api/session
//   /api/state
//   /api/spin
//   /api/reset
//
// Crash:
//   /api/crash/start
//   /api/crash/cashout
//   /api/crash/state
//   /api/crash/stream
//
// Laboratório:
//   /api/lab/*
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const {
  BETS,
  spin,
  SYMBOLS
} = require("./game");

const {
  HttpError,
  MIN_BET,
  MAX_BET
} = require("./lib/common");

const { SecureCrashEngine } = require("./lib/crash-secure");
const { Lab } = require("./lib/lab");
const { GROWTH, MAX_MULT } = require("./lib/multiplier");
const { EDGE } = require("./lib/rng");
const { createWallet } = require("./lib/wallet");

const PUBLIC = path.join(__dirname, "public");

const MAX_PLAYERS = 1000;
const MAX_BODY = 10000;
const TOKEN_RE = /^[a-f0-9]{64}$/i;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

function send(res, code, data, extraHeaders = {}) {
  if (res.destroyed || res.writableEnded) return;

  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });

  res.end(JSON.stringify(data));
}

// Lê o corpo JSON com limite de tamanho.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooBig = false;
    let finished = false;

    function fail(error) {
      if (finished) return;
      finished = true;
      reject(error);
    }

    req.on("data", (chunk) => {
      if (tooBig || finished) return;

      raw += chunk.toString("utf8");

      if (Buffer.byteLength(raw, "utf8") > MAX_BODY) {
        tooBig = true;
        fail(new HttpError(413, "Corpo grande demais"));
        req.resume();
      }
    });

    req.on("aborted", () => {
      fail(new HttpError(400, "Requisição interrompida"));
    });

    req.on("error", () => {
      fail(new HttpError(400, "Falha ao ler a requisição"));
    });

    req.on("end", () => {
      if (finished) return;

      if (tooBig) {
        return fail(new HttpError(413, "Corpo grande demais"));
      }

      if (!raw.trim()) {
        finished = true;
        return resolve({});
      }

      try {
        const value = JSON.parse(raw);

        if (
          value === null ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          return fail(new HttpError(400, "JSON inválido"));
        }

        finished = true;
        resolve(value);
      } catch {
        fail(new HttpError(400, "JSON inválido"));
      }
    });
  });
}

/**
 * Cria a aplicação.
 * O relógio, o agendamento, a semente e a carteira podem ser injetados.
 */
function createApp({
  now = Date.now,
  schedule = setTimeout,
  labLogFile,
  newSeed,
  wallet = null
} = {}) {
  const players = new Map();

  const engine = new SecureCrashEngine({
    now,
    ...(newSeed ? { newSeed } : {})
  });

  const lab = new Lab({
    now,
    ...(labLogFile !== undefined ? { logFile: labLogFile } : {})
  });

  // A carteira MySQL é a fonte oficial do saldo.
  const getPlayer = async (token) => {
    if (
      !wallet ||
      typeof token !== "string" ||
      !TOKEN_RE.test(token)
    ) {
      throw new HttpError(
        401,
        "Sessão inválida. Entre novamente pelo Lucky Charm.",
        { code: "NO_SESSION" }
      );
    }

    const user = await wallet.authUser(token);

    if (!user) {
      throw new HttpError(
        401,
        "Sessão expirada. Entre novamente pelo Lucky Charm.",
        { code: "NO_SESSION" }
      );
    }

    let player = players.get(token);

    if (!player) {
      if (players.size >= MAX_PLAYERS) {
        const oldestToken = players.keys().next().value;

        if (oldestToken !== undefined) {
          players.delete(oldestToken);
        }
      }

      player = {
        token,
        userId: user.id,
        username: user.username,
        balance: Number(user.balance) / 100,
        round: null,
        history: [],
        sse: new Set()
      };

      players.set(token, player);
    }

    player.userId = user.id;
    player.username = user.username;
    player.balance = Number(user.balance) / 100;

    return player;
  };

  // Envia eventos para os navegadores conectados.
  const sseSend = (player, event, data) => {
    const message =
      `event: ${event}\n` +
      `data: ${JSON.stringify(data)}\n\n`;

    for (const res of player.sse) {
      if (res.destroyed || res.writableEnded) {
        player.sse.delete(res);
        continue;
      }

      try {
        res.write(message);
      } catch {
        player.sse.delete(res);
      }
    }
  };

  // Resolve a rodada quando o momento de encerramento chega.
  const settle = (player) => {
    const result = engine.resolve(player);

    if (result) {
      sseSend(player, "crash", engine.view(result));
    }

    return result;
  };

  async function api(req, res, url) {
    const method = req.method;
    const pathname = url.pathname;

    // --------------------------------------------------------
    // SESSÃO LUCKY CHARM
    // --------------------------------------------------------

    if (
      method === "POST" &&
      pathname === "/api/session"
    ) {
      const body = await readBody(req);
      const token = body.token;

      await getPlayer(token);

      const user = await wallet.authUser(token);

      return send(res, 200, {
        token,
        balance: Number(user.balance) / 100,
        bets: BETS,
        symbols: SYMBOLS.map((symbol) => ({
          icon: symbol.icon,
          pay: symbol.pay
        })),
        crash: {
          growth: GROWTH,
          maxMult: MAX_MULT,
          minBet: MIN_BET,
          maxBet: MAX_BET,
          edge: EDGE
        }
      });
    }

    if (
      method === "GET" &&
      pathname === "/api/state"
    ) {
      const player = await getPlayer(
        url.searchParams.get("token")
      );

      return send(res, 200, {
        balance: player.balance
      });
    }

    // O Slot PHP continua responsável pelas rodadas do Slot.
    if (
      method === "POST" &&
      pathname === "/api/spin"
    ) {
      throw new HttpError(
        410,
        "Use o endpoint do Slot PHP para jogar no Slot."
      );
    }

    if (
      method === "POST" &&
      pathname === "/api/reset"
    ) {
      throw new HttpError(
        403,
        "Reiniciar saldo está desativado para contas vinculadas."
      );
    }

    // --------------------------------------------------------
    // CRASH VINCULADO À CARTEIRA MYSQL
    // --------------------------------------------------------

    if (
      method === "POST" &&
      pathname === "/api/crash/start"
    ) {
      const body = await readBody(req);
      const player = await getPlayer(body.token);
      const bet = Number(body.bet);

      if (
        !Number.isFinite(bet) ||
        bet <= 0 ||
        Math.round(bet * 100) !== bet * 100
      ) {
        throw new HttpError(
          400,
          "Aposta inválida. Use no máximo duas casas decimais."
        );
      }

      const betCents = Math.round(bet * 100);

      if (player.balance < bet) {
        throw new HttpError(400, "Saldo insuficiente.");
      }

      // Debita primeiro no MySQL.
      const debited = await wallet.apply(
        player.userId,
        -betCents
      );

      if (!debited) {
        throw new HttpError(
          400,
          "Saldo insuficiente ou saldo alterado em outra sessão."
        );
      }

      const oldBalance = player.balance;

      try {
        const round = engine.start(player, bet);

        // O mecanismo agenda o encerramento da rodada.
        schedule(
          () => settle(player),
          round.crashTimeMs + 20
        );

        return send(res, 200, {
          balance: player.balance,
          round: engine.view(round),
          serverNow: now()
        });
      } catch (error) {
        // Se a rodada não puder começar, tenta devolver a aposta.
        await wallet
          .apply(player.userId, betCents)
          .catch(() => false);

        player.balance = oldBalance;

        throw error;
      }
    }

    if (
      method === "POST" &&
      pathname === "/api/crash/cashout"
    ) {
      const body = await readBody(req);
      const player = await getPlayer(body.token);

      if (typeof body.roundId !== "string") {
        throw new HttpError(400, "roundId obrigatório");
      }

      const round = engine.cashout(
        player,
        body.roundId,
        typeof body.displayedMultiplier === "number"
          ? body.displayedMultiplier
          : undefined
      );

      const payoutCents = Math.round(
        Number(round.payout || 0) * 100
      );

      if (payoutCents > 0) {
        const credited = await wallet.apply(
          player.userId,
          payoutCents
        );

        if (!credited) {
          const user = await wallet.authUser(body.token);

          if (user) {
            player.balance = Number(user.balance) / 100;
          }

          throw new HttpError(
            503,
            "A retirada foi processada, mas não foi possível confirmar o crédito. Confira o saldo antes de tentar novamente."
          );
        }
      }

      try {
        await wallet.logRound(
          player.userId,
          round,
          player.balance
        );
      } catch (error) {
        console.warn(
          "Histórico Crash não gravado (confira a tabela crash_rounds):",
          error.message
        );
      }

      return send(res, 200, {
        outcome: "cashed",
        multiplier: round.cashedAt,
        payout: round.payout,
        balance: player.balance,
        round: engine.view(round),
        history: player.history
      });
    }

    if (
      method === "GET" &&
      pathname === "/api/crash/state"
    ) {
      const player = await getPlayer(
        url.searchParams.get("token")
      );

      settle(player);

      return send(res, 200, {
        balance: player.balance,
        round: engine.view(player.round),
        history: player.history,
        serverNow: now()
      });
    }

    if (
      method === "GET" &&
      pathname === "/api/crash/stream"
    ) {
      const player = await getPlayer(
        url.searchParams.get("token")
      );

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      res.write(
        "retry: 1500\n" +
        "event: hello\n" +
        "data: {}\n\n"
      );

      player.sse.add(res);

      const heartbeat = setInterval(() => {
        if (res.destroyed || res.writableEnded) {
          clearInterval(heartbeat);
          player.sse.delete(res);
          return;
        }

        res.write(": ping\n\n");
      }, 15000);

      req.on("close", () => {
        clearInterval(heartbeat);
        player.sse.delete(res);
      });

      return;
    }

    // --------------------------------------------------------
    // LABORATÓRIO ISOLADO: CRÉDITOS DE TESTE
    // --------------------------------------------------------

    if (pathname.startsWith("/api/lab/")) {
      if (
        method === "POST" &&
        pathname === "/api/lab/session"
      ) {
        const session = lab.createSession();

        return send(res, 200, {
          token: session.token,
          createdAt: session.createdAt,
          test: true,
          credits: 1000,
          engines: ["vulnerable", "secure"],
          rngs: ["weak", "secure"]
        });
      }

      if (
        method === "POST" &&
        pathname === "/api/lab/start"
      ) {
        const body = await readBody(req);

        return send(
          res,
          200,
          lab.start(
            body.token,
            body.engine,
            body.rng,
            body.bet
          )
        );
      }

      if (
        method === "POST" &&
        pathname === "/api/lab/cashout"
      ) {
        const body = await readBody(req);

        return send(
          res,
          200,
          lab.cashout(
            body.token,
            body.engine,
            body.rng,
            body.roundId,
            body.multiplier
          )
        );
      }

      if (
        method === "POST" &&
        pathname === "/api/lab/reset"
      ) {
        const body = await readBody(req);

        return send(
          res,
          200,
          lab.reset(
            body.token,
            body.engine,
            body.rng
          )
        );
      }

      if (
        method === "GET" &&
        pathname === "/api/lab/state"
      ) {
        const query = url.searchParams;

        return send(
          res,
          200,
          lab.state(
            query.get("token"),
            query.get("engine"),
            query.get("rng")
          )
        );
      }

      if (
        method === "GET" &&
        pathname === "/api/lab/log"
      ) {
        return send(res, 200, {
          log: lab.session(
            url.searchParams.get("token")
          ).log
        });
      }

      if (
        method === "GET" &&
        pathname === "/api/lab/export.csv"
      ) {
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="lab-eventos.csv"',
          "Cache-Control": "no-store"
        });

        // BOM para facilitar a abertura do CSV com UTF-8.
        return res.end(
          "\uFEFF" +
          lab.csv(url.searchParams.get("token"))
        );
      }
    }

    throw new HttpError(404, "Rota não encontrada");
  }

  // ----------------------------------------------------------
  // ARQUIVOS ESTÁTICOS
  // ----------------------------------------------------------

  function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end("Método não permitido");
    }

    let relativePath;

    try {
      relativePath =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      res.writeHead(400);
      return res.end("Requisição inválida");
    }

    const file = path.resolve(PUBLIC, relativePath);

    // Impede que o caminho solicitado saia da pasta public.
    if (
      file !== PUBLIC &&
      !file.startsWith(PUBLIC + path.sep)
    ) {
      res.writeHead(403);
      return res.end("Proibido");
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        return res.end("Não encontrado");
      }

      res.writeHead(200, {
        "Content-Type":
          MIME[path.extname(file).toLowerCase()] ||
          "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });

      if (req.method === "HEAD") {
        return res.end();
      }

      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    let url;

    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return send(res, 400, {
        error: "URL inválida"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      api(req, res, url).catch((error) => {
        if (res.destroyed || res.writableEnded) return;

        if (error instanceof HttpError) {
          return send(res, error.status, {
            error: error.message,
            ...error.extra
          });
        }

        console.error(error);

        send(res, 500, {
          error: "Erro interno"
        });
      });

      return;
    }

    serveStatic(req, res, url);
  });

  return {
    server,
    players,
    engine,
    lab
  };
}

module.exports = {
  createApp
};

// ------------------------------------------------------------
// INICIALIZAÇÃO DIRETA
// ------------------------------------------------------------

if (require.main === module) {
  const PORT =
    process.env.PORT === undefined
      ? 3000
      : Number(process.env.PORT);

  const HOST = process.env.HOST || "127.0.0.1";

  const wallet = createWallet();

  const { server } = createApp({ wallet });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `\nA porta ${PORT} já está em uso. ` +
        "Feche o outro programa ou use outra porta.\n"
      );
    } else {
      console.error(error);
    }

    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(
      `\n  Lucky Charm Demo rodando em ` +
      `http://localhost:${server.address().port}`
    );

    console.log(
      "  Crash: /  Laboratório: /lab.html  Slot: /slot.html"
    );

    console.log(
      "  Deixe esta janela aberta; Ctrl+C para parar.\n"
    );
  });
}
