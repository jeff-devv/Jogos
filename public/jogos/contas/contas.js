const $ = (id) => document.getElementById(id);
const DURATION = 60;
const PENALTY = 3;

let score = 0, best = 0, timeLeft = 0, playing = false, clock = null, answer = 0;

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// a dificuldade sobe com os pontos: primeiro soma, depois subtração e multiplicação
function makeQuestion() {
  const ops = score < 5 ? ["+"] : score < 12 ? ["+", "−"] : ["+", "−", "×"];
  const op = ops[rand(0, ops.length - 1)];
  const top = 10 + score * 3;
  let a, b;
  if (op === "×") {
    a = rand(2, 9 + Math.floor(score / 10));
    b = rand(2, 9);
    answer = a * b;
  } else if (op === "−") {
    a = rand(5, top);
    b = rand(1, a);
    answer = a - b;
  } else {
    a = rand(1, top);
    b = rand(1, top);
    answer = a + b;
  }
  $("question").textContent = `${a} ${op} ${b} = ?`;

  // alternativas erradas próximas da certa, para não dar para chutar pelo tamanho
  const options = new Set([answer]);
  while (options.size < 4) {
    const wrong = answer + rand(-10, 10);
    if (wrong >= 0 && wrong !== answer) options.add(wrong);
  }
  const box = $("answers");
  box.innerHTML = "";
  [...options].sort(() => Math.random() - 0.5).forEach((v) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "answer";
    b.textContent = v;
    b.addEventListener("click", () => choose(v, b));
    box.appendChild(b);
  });
}

function start() {
  score = 0;
  timeLeft = DURATION;
  playing = true;
  $("score").textContent = "0";
  $("time").textContent = timeLeft;
  $("result").textContent = "";
  $("result").className = "result";
  $("startBtn").hidden = true;
  $("again").hidden = true;
  clock = setInterval(() => {
    timeLeft--;
    $("time").textContent = Math.max(0, timeLeft);
    if (timeLeft <= 0) finish();
  }, 1000);
  makeQuestion();
}

function choose(v, btn) {
  if (!playing) return;
  if (v === answer) {
    score++;
    $("score").textContent = score;
    makeQuestion();
    return;
  }
  timeLeft -= PENALTY;
  $("time").textContent = Math.max(0, timeLeft);
  btn.classList.add("wrong");
  btn.disabled = true;
  if (timeLeft <= 0) finish();
}

function finish() {
  if (!playing) return;
  playing = false;
  clearInterval(clock);
  $("question").textContent = "⏰ Tempo!";
  $("answers").innerHTML = "";
  const record = score > best;
  best = saveRecord("contas", score);
  $("best").textContent = best;
  $("result").textContent = `Você acertou ${score} conta${score === 1 ? "" : "s"}` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : "");
  $("again").hidden = false;
}

$("startBtn").addEventListener("click", start);
$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("contas", 0);
  $("best").textContent = best;
});
