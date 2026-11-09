// Sessão compartilhada pelos jogos sem aposta (carregar antes do .js do jogo):
//   <script src="../../sessao.js"></script>
// checkSession(): confere o login no me.php e mostra o usuário em #hUser. Jogo sem aposta não exige
// conta: sem sessão válida, joga como visitante (devolve null). Só Slot, Crash e Roleta exigem login.
// saveRecord(jogo, valor): guarda o recorde do jogo neste navegador e devolve o maior valor.

const SESSION_TOKEN_KEY = "slot_token";
const GUEST = "visitante"; // mesma chave de recorde usada pela home para quem não entrou
let sessionUser = GUEST;

async function checkSession() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);
  const asGuest = () => {
    sessionUser = GUEST;
    document.getElementById("hUser").textContent = "Visitante";
    return null;
  };
  if (!token) return asGuest();
  try {
    const r = await fetch("../../api/me.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (r.status === 401) localStorage.removeItem(SESSION_TOKEN_KEY); // sessão vencida
    if (!r.ok) throw new Error("sessão");
    const me = await r.json();
    sessionUser = me.username;
    document.getElementById("hUser").textContent = me.username;
    return me;
  } catch (e) {
    return asGuest();
  }
}

// recorde por jogo e por usuário; o navegador pode bloquear o localStorage, então nunca quebra o jogo
function saveRecord(game, value) {
  const key = `recorde_${game}_${sessionUser}`;
  let best = 0;
  try { best = Number(localStorage.getItem(key)) || 0; } catch (e) {}
  if (value > best) {
    best = value;
    try { localStorage.setItem(key, String(best)); } catch (e) {}
  }
  return best;
}
