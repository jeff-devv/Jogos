const $ = (id) => document.getElementById(id);
const PICKS = {
  pedra: { icon: "✊", beats: "tesoura" },
  papel: { icon: "✋", beats: "pedra" },
  tesoura: { icon: "✌️", beats: "papel" },
};
const NAMES = Object.keys(PICKS);

let wins = 0, losses = 0, streak = 0, best = 0, busy = false;

function setButtons(disabled) {
  document.querySelectorAll(".choice").forEach((b) => { b.disabled = disabled; });
}

// o computador "balança a mão" um instante antes de mostrar a escolha
function play(pick) {
  if (busy) return;
  busy = true;
  setButtons(true);
  $("mine").textContent = PICKS[pick].icon;
  $("result").textContent = "Jo... ken... pô!";
  $("result").className = "result";
  let n = 0;
  const shake = setInterval(() => { $("cpu").textContent = PICKS[NAMES[n++ % 3]].icon; }, 90);

  setTimeout(() => {
    clearInterval(shake);
    const cpu = NAMES[Math.floor(Math.random() * NAMES.length)];
    $("cpu").textContent = PICKS[cpu].icon;
    finish(pick, cpu);
    busy = false;
    setButtons(false);
  }, 700);
}

function finish(pick, cpu) {
  if (pick === cpu) {
    $("result").textContent = "Empate! Jogue de novo.";
    return;
  }
  if (PICKS[pick].beats === cpu) {
    wins++;
    streak++;
    const record = streak > best;
    best = saveRecord("jokenpo", streak);
    $("result").textContent = `${cap(pick)} ganha de ${cpu}! Você venceu` + (record ? " · nova melhor sequência!" : ".");
    $("result").className = "result ok";
  } else {
    losses++;
    streak = 0;
    $("result").textContent = `${cap(cpu)} ganha de ${pick}. O computador venceu.`;
    $("result").className = "result bad";
  }
  $("wins").textContent = wins;
  $("losses").textContent = losses;
  $("streak").textContent = streak;
  $("best").textContent = best;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

document.querySelectorAll(".choice").forEach((b) => {
  b.addEventListener("click", () => play(b.dataset.pick));
});

checkSession().then(() => {
  best = saveRecord("jokenpo", 0);
  $("best").textContent = best;
  $("result").textContent = "Escolha pedra, papel ou tesoura.";
});
