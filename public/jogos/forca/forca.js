const $ = (id) => document.getElementById(id);
const MAX_ERRORS = 6;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const WORDS = {
  ANIMAIS: ["JACARÉ", "TAMANDUÁ", "CAPIVARA", "PINGUIM", "GIRAFA", "TUCANO", "BORBOLETA", "CROCODILO", "ELEFANTE", "MACACO"],
  FRUTAS: ["ABACAXI", "MARACUJÁ", "JABUTICABA", "MELANCIA", "GOIABA", "ACEROLA", "PITANGA", "CAJU", "MORANGO", "PÊSSEGO"],
  PAÍSES: ["ARGENTINA", "PORTUGAL", "AUSTRÁLIA", "CANADÁ", "JAPÃO", "MOÇAMBIQUE", "NORUEGA", "EGITO", "MÉXICO", "ALEMANHA"],
  OBJETOS: ["GUARDA-CHUVA", "TESOURA", "CADEIRA", "TRAVESSEIRO", "LANTERNA", "BICICLETA", "RELÓGIO", "ESCOVA", "CHAVEIRO", "MOCHILA"],
};

let word = "", tried = new Set(), errors = 0, wins = 0, losses = 0, streak = 0, over = false;

// "Ã" -> "A", "Ç" -> "C": a letra digitada vale para todas as versões acentuadas
const base = (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
const isLetter = (ch) => /[A-Z]/.test(base(ch));

function buildKeyboard() {
  LETTERS.forEach((l) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "key";
    b.textContent = l;
    b.dataset.letter = l;
    b.addEventListener("click", () => guess(l));
    $("keyboard").appendChild(b);
  });
}

function start() {
  const categories = Object.keys(WORDS);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const list = WORDS[category];
  word = list[Math.floor(Math.random() * list.length)];
  tried = new Set();
  errors = 0;
  over = false;
  $("category").textContent = category;
  $("result").textContent = "";
  $("result").className = "result";
  $("again").hidden = true;
  document.querySelector(".gallows").classList.remove("lost");
  document.querySelectorAll(".gallows .part").forEach((p) => p.classList.remove("on"));
  document.querySelectorAll(".key").forEach((k) => { k.disabled = false; k.className = "key"; });
  render();
}

function render(reveal = false) {
  $("word").innerHTML = "";
  [...word].forEach((ch) => {
    const s = document.createElement("span");
    s.className = "slot";
    if (!isLetter(ch)) { s.classList.add("gap"); s.textContent = ch; }
    else if (tried.has(base(ch))) s.textContent = ch;
    else if (reveal) { s.textContent = ch; s.classList.add("missed"); }
    $("word").appendChild(s);
  });
  $("errors").textContent = `${errors}/${MAX_ERRORS}`;
  $("wins").textContent = wins;
  $("losses").textContent = losses;
}

function guess(letter) {
  if (over || tried.has(letter)) return;
  tried.add(letter);
  const hit = [...word].some((ch) => base(ch) === letter);
  const key = document.querySelector(`.key[data-letter="${letter}"]`);
  key.disabled = true;
  key.classList.add(hit ? "hit" : "miss");
  if (!hit) {
    errors++;
    document.querySelectorAll(".gallows .part")[errors - 1].classList.add("on");
  }
  const solved = [...word].every((ch) => !isLetter(ch) || tried.has(base(ch)));
  if (solved) return finish(true);
  if (errors >= MAX_ERRORS) return finish(false);
  render();
}

// recorde = maior sequência de vitórias seguidas
function finish(won) {
  over = true;
  if (won) { wins++; streak++; } else { losses++; streak = 0; }
  render(!won);
  document.querySelectorAll(".key").forEach((k) => { k.disabled = true; });
  if (!won) document.querySelector(".gallows").classList.add("lost");
  const best = saveRecord("forca", streak);
  $("best").textContent = best;
  $("result").textContent = won
    ? `Acertou! Sequência de ${streak} vitória${streak > 1 ? "s" : ""}` + (streak === best ? " · recorde!" : ".")
    : `Não foi dessa vez. A palavra era ${word}.`;
  $("result").className = "result " + (won ? "ok" : "bad");
  $("again").hidden = false;
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "Enter" && over) return start();
  const l = base(e.key.toUpperCase());
  if (l.length === 1 && LETTERS.includes(l)) guess(l);
});
$("again").addEventListener("click", start);

buildKeyboard();
checkSession().then(() => {
  $("best").textContent = saveRecord("forca", 0);
  start();
});
