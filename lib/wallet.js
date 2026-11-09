// ============================================================
// CARTEIRA: liga o Node ao MESMO MySQL do login.php / admin / slot PHP.
// Tabelas usadas: users (balance em CENTAVOS), sessions, crash_rounds (opcional).
// O crash trabalha em créditos (10.00); o banco guarda centavos (1000).
// ============================================================
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const SESSION_TTL = 60 * 60 * 24; // igual ao config.php

function createWallet(cfg = {}) {
  const pool = mysql.createPool({
    host: cfg.host || process.env.DB_HOST || "127.0.0.1",
    user: cfg.user || process.env.DB_USER || "root",
    password: cfg.password ?? process.env.DB_PASS ?? "",
    database: cfg.database || process.env.DB_NAME || "lucky_charm",
    connectionLimit: 5,
  });

  // mesma regra do require_user() do PHP
  async function authUser(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.balance, u.is_admin
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?`,
      [token, Math.floor(Date.now() / 1000)]
    );
    return rows[0] || null;
  }

  // mesma regra do login.php; o token vale também no slot PHP e no admin
  async function login(username, password) {
    const [rows] = await pool.execute("SELECT id, password_hash FROM users WHERE username = ?", [username]);
    const u = rows[0];
    if (!u) return null;
    // o PHP gera "$2y$"; o bcryptjs entende "$2a$" (mesmo algoritmo)
    const bcrypt = require("bcryptjs"); // só é necessário se o login for feito pelo Node
    const ok = await bcrypt.compare(password, u.password_hash.replace(/^\$2y\$/, "$2a$"));
    if (!ok) return null;
    const token = crypto.randomBytes(32).toString("hex");
    await pool.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
      token, u.id, Math.floor(Date.now() / 1000) + SESSION_TTL,
    ]);
    return token;
  }

  // Soma (ou subtrai) centavos de forma atômica. Débito só passa se houver saldo.
  // Devolve true/false. É a ÚNICA porta de escrita no saldo.
  async function apply(userId, deltaCents) {
    if (!Number.isInteger(deltaCents)) throw new Error("delta inválido");
    if (deltaCents === 0) return true;
    const [r] = deltaCents < 0
      ? await pool.execute("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?", [-deltaCents, userId, -deltaCents])
      : await pool.execute("UPDATE users SET balance = balance + ? WHERE id = ?", [deltaCents, userId]);
    return r.affectedRows === 1;
  }

  // histórico (tabela crash_rounds); se a tabela não existir, só avisa no console
  async function logRound(userId, r, balanceCreditsAfter) {
    await pool.execute(
      `INSERT INTO crash_rounds (user_id, bet, crash_point, cashout_mult, win, balance_after, seed_hash)
       VALUES (?,?,?,?,?,?,?)`,
      [userId, Math.round(r.bet * 100), r.crashPoint, r.cashedAt ?? null, Math.round((r.payout || 0) * 100), Math.round(balanceCreditsAfter * 100), r.commit]
    );
  }

  return { authUser, login, apply, logRound, pool };
}

module.exports = { createWallet };
