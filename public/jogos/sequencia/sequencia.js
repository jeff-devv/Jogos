const $ = (id) => document.getElementById(id);
const pads = [...document.querySelectorAll(".pad-color")];
const TONES = [330, 262, 392, 196]; // uma nota por cor ajuda a lembrar a sequência

let seq = [], pos = 0, level = 0, best = 0, listening = false, audio = null;

function beep(i) {
  try {
    audio = audio || new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = TONES[i];
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.35);
  } catch (e) {} // sem som o jogo continua
}

function light(i, ms) {
  pads[i].classList.add("lit");
  beep(i);
  setTimeout(() => pads[i].classList.remove("lit"), ms);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function start() {
  seq = [];
  level = 0;
  $("level").textContent = "0";
  $("startBtn").hidden = true;
  $("again").hidden = true;
  $("result").className = "result";
  nextRound();
}

async function nextRound() {
  listening = false;
  seq.push(Math.floor(Math.random() * 4));
  pos = 0;
  $("result").textContent = "Observe...";
  await wait(700);
  const ms = Math.max(250, 520 - seq.length * 15); // acelera conforme a sequência cresce
  for (const i of seq) {
    light(i, ms);
    await wait(ms + 160);
  }
  $("result").textContent = "Sua vez!";
  listening = true;
}

function press(i) {
  if (!listening) return;
  light(i, 220);
  if (i !== seq[pos]) return gameOver();
  pos++;
  if (pos < seq.length) return;
  level = seq.length;
  $("level").textContent = level;
  nextRound();
}

function gameOver() {
  listening = false;
  const record = level > best;
  best = saveRecord("sequencia", level);
  $("best").textContent = best;
  $("result").textContent = `Errou! Você chegou ao nível ${level}` + (record ? " · novo recorde!" : ".");
  $("result").className = "result" + (record ? " ok" : " bad");
  $("again").hidden = false;
}

pads.forEach((p) => p.addEventListener("click", () => press(Number(p.dataset.i))));
$("startBtn").addEventListener("click", start);
$("again").addEventListener("click", start);

checkSession().then(() => {
  best = saveRecord("sequencia", 0);
  $("best").textContent = best;
});
