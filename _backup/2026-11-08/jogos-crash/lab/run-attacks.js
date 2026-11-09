// Executa todos os ataques didáticos contra o laboratório local e imprime a comparação.
// Uso: node lab/run-attacks.js        (gera também logs/relatorio-ataques.md)
// Tudo roda dentro deste processo, com créditos fictícios e relógio simulado.
const fs = require("fs");
const path = require("path");
const { startServer, fakeClock } = require("../tests/helpers");
const A = require("./attacks");

const money = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2);
(async () => {
  const clock = fakeClock();
  const srv = await startServer({ now: clock, schedule: () => {} });
  const h = { call: srv.call, clock };
  const rows = [];
  const add = (id, nome, v, s, fmtV, fmtS) => rows.push({ id, nome, v: fmtV(v), s: fmtS(s) });

  let v = await A.tamperMultiplier(h, "vulnerable"), s = await A.tamperMultiplier(h, "secure");
  add("A1", "Adulterar multiplicador na retirada (enviar 1000x)", v, s, (x) => `ACEITO: creditado ${x.credited} (lucro ${money(x.profit)})`, (x) => `IGNORADO: creditado ${x.credited} (lucro ${money(x.profit)})`);

  v = await A.replayCashout(h, "vulnerable"); s = await A.replayCashout(h, "secure");
  add("A2", "Repetir a mesma retirada 5x (replay)", v, s, (x) => `${x.accepted}/5 aceitas (lucro ${money(x.profit)})`, (x) => `${x.accepted}/5 aceita; demais 409 (lucro ${money(x.profit)})`);

  v = await A.lateCashout(h, "vulnerable"); s = await A.lateCashout(h, "secure");
  add("A3", "Retirar depois que a rodada caiu", v, s, (x) => `ACEITO (${x.status}), lucro ${money(x.profit)}`, (x) => `RECUSADO (${x.status} ${x.code}), resultado ${money(x.profit)}`);

  v = await A.negativeBet(h, "vulnerable"); s = await A.negativeBet(h, "secure");
  add("A4", "Aposta negativa (−500)", v, s, (x) => `ACEITA (${x.status}), saldo ${money(x.profit)}`, (x) => `RECUSADA (${x.status}), saldo ${money(x.profit)}`);

  v = await A.parallelRounds(h, "vulnerable"); s = await A.parallelRounds(h, "secure");
  add("A5", "Duas rodadas simultâneas", v, s, (x) => `2ª rodada: ${x.second} (aceita)`, (x) => `2ª rodada: ${x.second} ${x.code || ""}`);

  v = await A.predictRng(h, "vulnerable", "weak"); s = await A.predictRng(h, "secure", "weak");
  const sc = await A.predictRng(h, "secure", "secure"), vc = await A.predictRng(h, "vulnerable", "secure");
  const pf = (x) => `semente ${x.seedFound ? "DESCOBERTA" : "não encontrada"}; ${x.bets} apostas altas, ${x.wins} vitórias; resultado ${money(x.net)}`;
  rows.push({ id: "A6a", nome: "Prever gerador PREVISÍVEL (vulnerável)", v: pf(v), s: "—" });
  rows.push({ id: "A6b", nome: "Prever gerador PREVISÍVEL (protegida + compromisso/revelação)", v: "—", s: pf(s) });
  rows.push({ id: "A6c", nome: "Prever gerador CRIPTOGRÁFICO", v: pf(vc), s: pf(sc) });

  const w = Math.max(...rows.map((r) => r.nome.length));
  console.log("\nLABORATÓRIO · créditos fictícios · relógio simulado\n");
  for (const r of rows) { console.log(`${r.id}  ${r.nome}`); console.log(`      vulnerável: ${r.v}`); console.log(`      protegida : ${r.s}\n`); }

  const md = ["# Relatório dos ataques didáticos (laboratório local)", "", `Gerado em ${new Date().toISOString()} · créditos fictícios · relógio simulado.`, "", "| ID | Ataque | Implementação vulnerável | Implementação protegida |", "|---|---|---|---|", ...rows.map((r) => `| ${r.id} | ${r.nome} | ${r.v} | ${r.s} |`), ""].join("\n");
  fs.mkdirSync(path.join(__dirname, "..", "logs"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "logs", "relatorio-ataques.md"), md);
  console.log("Relatório salvo em logs/relatorio-ataques.md\n");
  await srv.close();
})();
