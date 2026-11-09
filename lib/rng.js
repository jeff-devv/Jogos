// Geradores de números e cálculo do ponto de queda (crashPoint).
const crypto = require("crypto");
const { MAX_MULT } = require("./multiplier");

const EDGE = 0.04; // vantagem da casa de 4% (RTP teórico 96%)

// ---------- gerador SEGURO ----------
// 52 bits vindos do gerador criptográfico do sistema operacional.
// junta 52 bits sem sobreposição (20 bits dos bytes 0-2 + 32 bits dos bytes 3-6)
function bits52(b) { return ((b.readUIntBE(0, 3) >>> 4) * 2 ** 32 + b.readUInt32BE(3)) / 2 ** 52; }
function secureFloat() {
  const b = crypto.randomBytes(7);
  return bits52(b);
}
function secureSeedHex() { return crypto.randomBytes(32).toString("hex"); }

// ---------- gerador PREVISÍVEL (só para o laboratório) ----------
// Mulberry32: rápido e bom para jogos, mas NÃO é seguro: todo o estado é
// um número de 32 bits e aqui ele nasce do relógio (segundos).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function createWeakStream(seedInt) {
  const next = mulberry32(seedInt);
  return {
    float: () => next(),
    seedHex: () => { let h = ""; for (let i = 0; i < 8; i++) h += Math.floor(next() * 4294967296).toString(16).padStart(8, "0"); return h; },
  };
}

// ---------- fórmula do ponto de queda ----------
// P(crashPoint >= x) = (1 - EDGE) / x  → retorno esperado de 96% para qualquer estratégia.
// Quando o resultado seria < 1.00 a rodada cai instantaneamente em 1.00x.
function crashFromFloat(r, edge = EDGE) {
  const raw = (1 - edge) / (1 - r);
  return Math.min(MAX_MULT, Math.max(1, Math.floor(raw * 100) / 100));
}

// ---------- compromisso / revelação (provably fair) ----------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
function floatFromSeed(serverSeed, roundId) {
  const h = crypto.createHmac("sha256", serverSeed).update(roundId).digest();
  return bits52(h);
}
function crashPointFromSeed(serverSeed, roundId, edge = EDGE) {
  return crashFromFloat(floatFromSeed(serverSeed, roundId), edge);
}

module.exports = { EDGE, secureFloat, secureSeedHex, mulberry32, createWeakStream, crashFromFloat, sha256, floatFromSeed, crashPointFromSeed };
