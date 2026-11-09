const $ = (id) => document.getElementById(id);
const ROUNDS = 10;
const TIME_MS = 20000;

// a primeira alternativa é a correta (a ordem na tela é sorteada)
const QUESTIONS = [
  ["Qual é a capital do Brasil?", "Brasília", "Rio de Janeiro", "São Paulo", "Salvador"],
  ["Quantos lados tem um hexágono?", "6", "5", "7", "8"],
  ["Qual é o maior planeta do Sistema Solar?", "Júpiter", "Saturno", "Terra", "Netuno"],
  ["Quem pintou a Mona Lisa?", "Leonardo da Vinci", "Michelangelo", "Van Gogh", "Picasso"],
  ["Qual é o maior oceano da Terra?", "Pacífico", "Atlântico", "Índico", "Ártico"],
  ["Em que ano o Brasil declarou a independência?", "1822", "1808", "1889", "1500"],
  ["Qual é o símbolo químico do ouro?", "Au", "Ag", "Fe", "Ou"],
  ["Quantos ossos tem o corpo humano adulto?", "206", "196", "216", "186"],
  ["Qual é o maior mamífero do mundo?", "Baleia-azul", "Elefante-africano", "Girafa", "Orca"],
  ["Qual é a língua oficial de Angola?", "Português", "Inglês", "Francês", "Espanhol"],
  ["Quanto é 7 × 8?", "56", "54", "48", "64"],
  ["Qual planeta é conhecido como Planeta Vermelho?", "Marte", "Vênus", "Mercúrio", "Júpiter"],
  ["Quem escreveu \"Dom Casmurro\"?", "Machado de Assis", "José de Alencar", "Carlos Drummond de Andrade", "Clarice Lispector"],
  ["Qual rio tem o maior volume de água do mundo?", "Amazonas", "Nilo", "Mississippi", "São Francisco"],
  ["Quantos segundos tem uma hora?", "3600", "360", "6000", "1200"],
  ["Qual gás as plantas absorvem na fotossíntese?", "Gás carbônico", "Oxigênio", "Nitrogênio", "Hélio"],
  ["Qual é a capital da Argentina?", "Buenos Aires", "Santiago", "Montevidéu", "Lima"],
  ["Quantos jogadores de cada time ficam em campo no futebol?", "11", "10", "9", "12"],
  ["Qual é o menor país do mundo?", "Vaticano", "Mônaco", "Malta", "San Marino"],
  ["A água ferve a quantos graus Celsius ao nível do mar?", "100", "90", "120", "80"],
  ["Quem foi o primeiro ser humano a pisar na Lua?", "Neil Armstrong", "Buzz Aldrin", "Yuri Gagarin", "Michael Collins"],
  ["Qual é o continente mais populoso?", "Ásia", "África", "Europa", "América"],
  ["Quantos estados tem o Brasil, sem contar o Distrito Federal?", "26", "27", "25", "24"],
  ["Qual instrumento mede a pressão atmosférica?", "Barômetro", "Termômetro", "Higrômetro", "Anemômetro"],
  ["Qual é o maior deserto quente do mundo?", "Saara", "Atacama", "Gobi", "Kalahari"],
  ["Em que país ficam as pirâmides de Gizé?", "Egito", "México", "Peru", "Sudão"],
  ["Qual é a fórmula química da água?", "H₂O", "CO₂", "O₂", "NaCl"],
  ["Quantas cores tem o arco-íris?", "7", "6", "5", "8"],
  ["Qual destes animais é um anfíbio?", "Sapo", "Lagarto", "Tartaruga", "Cobra"],
  ["Qual é a capital de Portugal?", "Lisboa", "Porto", "Coimbra", "Braga"],
  ["Quem descobriu a penicilina?", "Alexander Fleming", "Louis Pasteur", "Marie Curie", "Isaac Newton"],
  ["Qual é o maior órgão do corpo humano?", "Pele", "Fígado", "Coração", "Pulmão"],
];

let deck = [], round = 0, hits = 0, score = 0;
let deadline = 0, timerId = null, answered = false;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function start() {
  deck = shuffle(QUESTIONS).slice(0, ROUNDS);
  round = 0; hits = 0; score = 0;
  $("hits").textContent = "0";
  $("score").textContent = "0";
  $("again").hidden = true;
  $("card").hidden = false;
  showQuestion();
}

function showQuestion() {
  const [text, right, ...wrong] = deck[round];
  answered = false;
  $("round").textContent = `${round + 1}/${ROUNDS}`;
  $("question").textContent = text;
  $("result").textContent = "";
  $("result").className = "result";
  $("next").hidden = true;
  $("options").innerHTML = "";
  shuffle([right, ...wrong]).forEach((label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "option";
    b.textContent = label;
    b.addEventListener("click", () => answer(b, label === right));
    $("options").appendChild(b);
  });
  deadline = performance.now() + TIME_MS;
  clearInterval(timerId);
  timerId = setInterval(tick, 100);
  tick();
}

function tick() {
  const left = Math.max(0, deadline - performance.now());
  $("timerBar").style.width = (left / TIME_MS) * 100 + "%";
  $("timerBar").classList.toggle("low", left < 5000);
  if (left === 0) answer(null, false);
}

// acerto: 10 pontos + 1 ponto a cada 2 segundos que sobraram (máximo 20 por pergunta)
function answer(button, correct) {
  if (answered) return;
  answered = true;
  clearInterval(timerId);
  const left = Math.max(0, deadline - performance.now());
  const right = deck[round][1];
  document.querySelectorAll(".option").forEach((b) => {
    b.disabled = true;
    if (b.textContent === right) b.classList.add("right");
  });
  if (correct) {
    const points = 10 + Math.floor(left / 2000);
    hits++;
    score += points;
    $("result").textContent = `Certo! +${points} pontos`;
    $("result").className = "result ok";
  } else {
    if (button) button.classList.add("wrong");
    $("result").textContent = button ? `Errou! A resposta é ${right}.` : `Tempo esgotado! A resposta é ${right}.`;
    $("result").className = "result bad";
  }
  $("hits").textContent = hits;
  $("score").textContent = score;
  if (round + 1 < ROUNDS) $("next").hidden = false;
  else finish();
}

function finish() {
  const best = saveRecord("quiz", score);
  $("best").textContent = best;
  $("result").textContent += ` Fim: ${hits} de ${ROUNDS} acertos, ${score} pontos` + (score === best && score > 0 ? " · novo recorde!" : ".");
  $("again").hidden = false;
}

$("next").addEventListener("click", () => { round++; showQuestion(); });
$("again").addEventListener("click", start);

checkSession().then(() => {
  $("best").textContent = saveRecord("quiz", 0);
  start();
});
