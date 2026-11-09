const $ = (id) => document.getElementById(id);
const API = "../api/";

const TOKEN_KEY = "admin_token";
let token = sessionStorage.getItem(TOKEN_KEY);

const fmt = (c) => (Number(c) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function say(text, err = false) {
  $("msg").textContent = text;
  $("msg").className = err ? "err" : "";
}

async function api(path, body = {}) {
  const r = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || "Erro " + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

function setToken(t) {
  token = t;
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function showLogin() {
  setToken(null);
  $("panel").hidden = true;
  $("loginBox").hidden = false;
  $("btnLogout").hidden = true;
  $("inPass").value = "";
}

function showPanel() {
  $("loginBox").hidden = true;
  $("panel").hidden = false;
  $("btnLogout").hidden = false;
}

async function loadSettings() {
  const s = await api("admin_settings.php");
  $("inWeight").value = s.empty_weight;
  $("rtpInfo").textContent = "Peso atual do vazio: " + s.empty_weight + " (maior valor = menos prêmios).";
}

async function loadUsers() {
  const data = await api("admin_users.php");
  $("selUser").innerHTML = data.users
    .map((u) => `<option value="${u.id}">${u.username}</option>`).join("");
  $("tbody").innerHTML = data.users.map((u) =>
    `<tr><td>${u.username}</td><td>${fmt(u.balance)}</td><td>${u.is_admin ? "Sim" : "Não"}</td><td>${u.created_at}</td></tr>`
  ).join("");
  await loadSettings();
}

$("btnLogin").onclick = async () => {
  try {
    const r = await fetch(API + "login.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("inUser").value.trim(), password: $("inPass").value }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Erro");
    setToken(data.token);
    await loadUsers();
    showPanel();
    say("Conectado como administrador.");
  } catch (e) {
    setToken(null);
    say(e.status === 403 ? "Esta conta não é administrador." : e.message, true);
  }
};

$("btnLogout").onclick = async () => {
  try { await api("logout.php"); } catch (e) {}
  showLogin();
  say("Você saiu.");
};

$("btnCredit").onclick = async () => {
  try {
    const reais = parseFloat($("inAmount").value);
    if (!reais) return say("Informe um valor.", true);
    const cents = Math.round(reais * 100);
    const r = await api("admin_credit.php", { user_id: Number($("selUser").value), amount: cents });
    say("Saldo atualizado: " + fmt(r.balance));
    await loadUsers();
  } catch (e) { say(e.message, true); }
};

$("btnWeight").onclick = async () => {
  try {
    const w = parseInt($("inWeight").value, 10);
    if (isNaN(w)) return say("Informe um número.", true);
    await api("admin_settings.php", { empty_weight: w });
    say("Retorno atualizado.");
    await loadSettings();
  } catch (e) { say(e.message, true); }
};

$("btnRefresh").onclick = () => loadUsers().catch((e) => say(e.message, true));

if (token) {
  loadUsers()
    .then(showPanel)
    .catch(() => { setToken(null); showLogin(); });
} else {
  showLogin();
}
