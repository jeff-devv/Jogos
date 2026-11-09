# Relatório dos ataques didáticos (laboratório local)

Gerado em 2026-11-08T14:57:46.063Z · créditos fictícios · relógio simulado.

| ID | Ataque | Implementação vulnerável | Implementação protegida |
|---|---|---|---|
| A1 | Adulterar multiplicador na retirada (enviar 1000x) | ACEITO: creditado 10000 (lucro +9990.00) | IGNORADO: creditado 10 (lucro +0.00) |
| A2 | Repetir a mesma retirada 5x (replay) | 5/5 aceitas (lucro +90.00) | 1/5 aceita; demais 409 (lucro +0.00) |
| A3 | Retirar depois que a rodada caiu | ACEITO (200), lucro +10.00 | RECUSADO (409 ROUND_ENDED), resultado -10.00 |
| A4 | Aposta negativa (−500) | ACEITA (200), saldo +500.00 | RECUSADA (400), saldo +0.00 |
| A5 | Duas rodadas simultâneas | 2ª rodada: 200 (aceita) | 2ª rodada: 409 ROUND_ACTIVE |
| A6a | Prever gerador PREVISÍVEL (vulnerável) | semente DESCOBERTA; 14 apostas altas, 14 vitórias; resultado +8060.37 | — |
| A6b | Prever gerador PREVISÍVEL (protegida + compromisso/revelação) | — | semente DESCOBERTA; 30 apostas altas, 30 vitórias; resultado +6139.00 |
| A6c | Prever gerador CRIPTOGRÁFICO | semente não encontrada; 30 apostas altas, 11 vitórias; resultado -789.00 | semente não encontrada; 30 apostas altas, 14 vitórias; resultado -186.00 |
