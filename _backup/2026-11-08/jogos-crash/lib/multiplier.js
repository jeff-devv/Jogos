// Curva do multiplicador (compartilhada por servidor e navegador).
// m(t) = e^(GROWTH * t), arredondado para baixo em 2 casas.
// O servidor é a ÚNICA fonte de verdade: ele calcula o multiplicador pelo
// relógio dele; o navegador só desenha a mesma curva para animar.
const GROWTH = 0.00014; // por milissegundo (2x ≈ 5 s, 10x ≈ 16 s, 100x ≈ 33 s)
const MAX_MULT = 1000;

function multiplierAt(elapsedMs) {
  if (!(elapsedMs > 0)) return 1;
  const m = Math.floor(Math.exp(GROWTH * elapsedMs) * 100) / 100;
  return Math.min(m, MAX_MULT);
}

// Instante (ms desde o início) em que a rodada "cai" para um dado crashPoint.
function crashTimeMs(crashPoint) {
  if (crashPoint <= 1) return 0;
  return Math.ceil(Math.log(crashPoint) / GROWTH);
}

module.exports = { GROWTH, MAX_MULT, multiplierAt, crashTimeMs };
