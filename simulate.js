// Simula milhões de giros para mostrar a vantagem da casa (RTP).
// Uso: node simulate.js [giros] [aposta]
const { spin, theoreticalRTP } = require("./game");

const N = Number(process.argv[2]) || 1000000;
const BET = Number(process.argv[3]) || 10;
let paid = 0, hits = 0;
for (let i = 0; i < N; i++) {
  const r = spin(BET);
  paid += r.win;
  if (r.win > 0) hits++;
}
const wagered = N * BET;
const rtp = paid / wagered;
console.log(`Giros:               ${N.toLocaleString("pt-BR")}`);
console.log(`Total apostado:      ${wagered.toLocaleString("pt-BR")}`);
console.log(`Total pago:          ${paid.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`);
console.log(`RTP simulado:        ${(rtp * 100).toFixed(2)}%`);
console.log(`RTP teórico:         ${(theoreticalRTP() * 100).toFixed(2)}%`);
console.log(`Vantagem da casa:    ${((1 - rtp) * 100).toFixed(2)}%`);
console.log(`Taxa de acerto:      ${((hits / N) * 100).toFixed(2)}% dos giros pagam algo`);
console.log("\nConclusão: no longo prazo a casa sempre fica com a diferença.");
