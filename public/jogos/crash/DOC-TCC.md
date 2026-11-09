# Lucky Charm · Crash Demo + Laboratório de Integridade

Material de apoio para o TCC sobre funcionamento, integridade e possíveis manipulações em jogos de azar.
**Tudo é demonstrativo:** créditos fictícios, sem dinheiro real, sem pagamentos e sem integração com plataformas de apostas.
O servidor escuta só em `127.0.0.1` (este computador).

---

## 1. Visão geral

| Parte | Endereço | O que é |
|---|---|---|
| **Crash** (jogo normal) | `/` | Avião sobe, multiplicador cresce, jogador **retira** antes da queda. Motor **protegido**. |
| **Laboratório** | `/lab.html` | Compara implementação **vulnerável × protegida** e gerador **previsível × criptográfico**. Rodadas marcadas como TESTE, saldos separados. |
| **Slot** (já existia) | `/slot.html` | Caça-níquel anterior, mantido sem alteração de regras. |

```
Navegador (desenha e envia comandos)          Servidor (decide tudo)
 ─ POST /api/crash/start   {bet}        ──►   valida, debita, sorteia, guarda segredo
 ◄─ roundId, commit(hash), serverNow    ◄──
 ─ POST /api/crash/cashout {roundId}    ──►   calcula multiplicador pelo RELÓGIO DO SERVIDOR,
 ◄─ multiplicador, prêmio, saldo        ◄──   credita uma única vez
 ◄─ SSE "crash" (queda)                 ◄──   timer do servidor avisa a queda
```

O navegador conhece a curva (`e^(0,00014·t)`) só para animar. O resultado final, a queda e o prêmio vêm sempre do servidor.

## 2. Regras e matemática

* **Multiplicador:** `m(t) = floor(100·e^(0,00014·t)) / 100` (t em ms; 2× ≈ 5 s, 10× ≈ 16 s, teto 1000×). Arquivo `lib/multiplier.js`.
* **Ponto de queda:** `crash = max(1, floor(100·0,96 / (1 − r)) / 100)` com `r` uniforme em [0,1). Arquivo `lib/rng.js`.
  * `P(crash ≥ x) = 0,96 / x` → **retorno esperado de 96% para qualquer estratégia** (vantagem da casa 4%).
  * ≈ 4% das rodadas caem imediatamente em 1.00× (não dá para retirar).
* Rode `node crash-sim.js` para ver, com 1 milhão de rodadas, que retirar em 1,2×, 2×, 10× ou 50× rende ~96%: a estratégia só muda a **variância**, não a média.
* **Comparação com o slot:** o slot do projeto tem retorno de ~91% (`node simulate.js`).

## 3. Integridade: falhas × proteções

Os dois motores têm a **mesma interface** (`start`, `cashout`, `view`) para que o diff entre eles seja a lição:
`lib/crash-vulnerable.js` (falhas marcadas `FALHA #n`) e `lib/crash-secure.js` (proteções `P1…P8`).

| Falha (vulnerável) | Como seria explorada | Proteção (protegido) | Teste |
|---|---|---|---|
| **#1** aposta sem validação | enviar `bet = -500` → o "débito" **aumenta** o saldo; texto/NaN corrompem o saldo | **P1** valida tipo, 2 casas, mínimo/máximo, saldo | A4, `crash.test.js` (validação) |
| **#2** várias rodadas simultâneas | abrir rodadas em paralelo | **P2** uma rodada ativa por jogador | A5, teste de concorrência |
| **#4** confia no multiplicador do cliente (CWE-602) | adulterar JS/requisição: `multiplier: 1000` | **P5** multiplicador vem do relógio do servidor; o valor do cliente só vai para o log | A1, teste “valor vem do servidor” |
| **#5** não confere se a rodada caiu | retirar depois da queda | **P6** recusa com `409 ROUND_ENDED` | A3 |
| **#6** não marca a rodada como paga (replay) | repetir a mesma requisição de retirada | **P3/P4** `roundId` obrigatório; estado `running → cashed` | A2, retiradas simultâneas |
| **#3** gerador previsível (CWE-330/338) | semente = relógio em segundos → testar ±5 min de sementes, achar a que reproduz os resultados já revelados e **prever as próximas rodadas** | **P7/P8** semente de `crypto.randomBytes` + compromisso SHA-256 | A6 |

Observação importante do experimento **A6b**: usar *compromisso/revelação* (provably fair) **não protege** se a semente do servidor vier de um gerador fraco. O atacante reproduz o gerador, calcula a semente da próxima rodada e **confirma a previsão com o próprio compromisso (hash) publicado**.

Outras proteções do servidor (válidas para todas as rotas): corpo JSON limitado a 10 KB e validado (`400/413`), token no formato UUID, rotas e métodos desconhecidos (`404`), proteção contra *path traversal* nos arquivos estáticos, saldo bloqueado para *reset* durante rodada ativa, sem execução concorrente de duas operações do mesmo jogador (Node processa cada operação de forma atômica, sem `await` dentro do motor).

## 4. Laboratório (`/lab.html`)

* 4 combinações, cada uma com conta própria de 1000 créditos de teste: vulnerável/protegida × gerador previsível/criptográfico.
* Campo “**multiplicador que o navegador envia**”: digite `1000` para simular uma requisição adulterada (ou `auto` para enviar o valor exibido).
* Botões: reenviar a mesma retirada (replay), esperar a queda e retirar, apostar −500.
* **Registro de eventos** (tabela + CSV + arquivo `logs/lab-events.jsonl`) com: aposta, **multiplicador enviado**, **multiplicador do servidor**, **ponto de queda real**, **valor creditado**, saldo antes/depois e motivo de recusa. É a base para explicar a diferença entre *exibido × resultado × creditado*.
* Isolamento: contas e sessões do laboratório são outras estruturas de dados; o token do laboratório não vale no jogo normal e vice-versa (`tests/api.test.js`). Nenhum resultado de jogador real é alterado, e nenhuma lógica oculta favorece ou prejudica alguém.

### Ataques automatizados

```
node lab/run-attacks.js
```

Roda A1–A6 contra os dois motores (relógio simulado, instantâneo) e grava `logs/relatorio-ataques.md`. Resultado típico:

| ID | Ataque | Vulnerável | Protegida |
|---|---|---|---|
| A1 | enviar multiplicador 1000× | creditado 10000 (lucro +9990) | ignorado: creditado 10 (lucro 0) |
| A2 | repetir retirada 5× | 5/5 aceitas | 1/5 aceita, demais `409` |
| A3 | retirar depois da queda | aceito (+10) | `409 ROUND_ENDED` (−10) |
| A4 | aposta −500 | aceita (saldo +500) | `400` |
| A5 | 2 rodadas simultâneas | 2ª aceita | `409 ROUND_ACTIVE` |
| A6a | prever gerador previsível | semente descoberta, 14/14 apostas altas ganhas | — |
| A6b | prever gerador previsível **com** compromisso | — | semente descoberta, 29/30 ganhas |
| A6c | prever gerador criptográfico | semente **não** encontrada | semente **não** encontrada |

Em A6 o resultado é medido de forma **honesta** (pelo ponto de queda real), para isolar o efeito do gerador sem misturar as outras falhas. Os valores de A1–A5 e A6a/b são determinísticos (relógio simulado); os de A6c variam a cada execução.

## 5. Como rodar e testar

```
node server.js          # http://localhost:3000   (ou iniciar.bat no Windows)
node --test             # 35 testes (ou: npm test)
node lab/run-attacks.js # relatório dos ataques
node crash-sim.js       # RTP por estratégia (Crash)
node simulate.js        # RTP do slot
```

| Funcionalidade | Como testar à mão | Teste automático |
|---|---|---|
| Iniciar rodada | digite a aposta → *Iniciar rodada* (saldo cai pelo valor) | `início de rodada…` |
| Multiplicador/avião | acompanhe a curva e o número subir | `curva…` |
| Retirar | clique *Retirar* em voo (ou barra de espaço) | `retirada a tempo…` |
| Queda / aposta perdida | não retire; a tela mostra “Caiu!” | `encerramento…` |
| Retirar 2× / depois da queda | clique rápido em *Retirar*; no Lab use o botão de replay | `não retira duas vezes`, `não retira depois…` |
| Duas rodadas ao mesmo tempo | tente iniciar durante o voo (botão bloqueado); no Lab, inicie duas | `não inicia duas rodadas…` |
| Histórico | chips no topo (dourado = você retirou) | `encerramento…` |
| Verificação | *Verificar última rodada* mostra hash, semente e recálculo no navegador | `compromisso/revelação` |
| Falhas de comunicação | pare o servidor e clique algo (mensagem de conexão); reinicie e a sessão é recriada | `falhas de comunicação…` |
| Som | início, retirada e queda têm sons; botão *Som* liga/desliga | — |

## 6. Limitações (para escrever no TCC)

* O modelo é **didático**: um jogador por sessão, sem banco de dados (saldos em memória), sem autenticação real, sem rede aberta.
* A previsão A6 depende de o atacante **conhecer a janela de tempo** da criação da sessão e **observar resultados revelados**; é o cenário clássico de semente fraca, não uma receita contra plataformas reais.
* A auditoria real de casas de apostas envolve laboratórios certificados, registro de rodadas imutável, controle regulatório (no Brasil, Lei 14.790/2023 e portarias da SPA/MF) e proteção contra fraude em múltiplas camadas, que ficam fora deste protótipo.
* Referências úteis para citar: OWASP Top 10 (Insecure Design, Broken Access Control), CWE-330/338 (aleatoriedade insuficiente), CWE-362 (condição de corrida), CWE-602 (aplicação de regra de segurança só no cliente).

Jogar com dinheiro real pode causar dependência. Apoio: CVV 188.

## 7. Arquivos

**Novos:** `lib/multiplier.js`, `lib/rng.js`, `lib/common.js`, `lib/crash-secure.js`, `lib/crash-vulnerable.js`, `lib/lab.js`, `lab/attacks.js`, `lab/run-attacks.js`, `crash-sim.js`, `tests/helpers.js`, `tests/crash.test.js`, `tests/api.test.js`, `tests/lab.test.js`, `public/index.html` (agora é o Crash), `public/crash.css`, `public/crash.js`, `public/lab.html`, `public/lab.css`, `public/lab.js`, `DOC-TCC.md`.
**Modificados:** `server.js` (refatorado em `createApp`; rotas do slot **preservadas**; novas rotas `/api/crash/*` e `/api/lab/*`; escuta só em 127.0.0.1), `package.json`, `iniciar.bat`, `LEIA-ME.txt`, `README.md`.
**Movidos (sem mudar a lógica):** `public/index.html → slot.html`, `app.js → slot.js`, `style.css → slot.css`.
**Intactos:** `game.js`, `simulate.js`.
