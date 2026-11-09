# Padrão do projeto Lucky Charm

Regras para manter o código uniforme em futuras atualizações. Formatação básica (indentação,
fim de linha, UTF-8) está no `.editorconfig`; instale a extensão **EditorConfig for VS Code**.

## 1. Onde fica cada coisa

| Pasta / arquivo | Quem serve | O que é |
|---|---|---|
| `public/` | Apache (`http://localhost/lucky-charm/public/`) | **Único** lugar acessível pelo navegador |
| `public/index.html` + `app.js` + `style.css` + `slot-layout.css` | Apache | Login/cadastro e o Slot (PHP) |
| `public/home.html` + `styleHome.css` | Apache | Menu de jogos (lista `JOGOS`) |
| `public/admin/` | Apache | Painel do administrador |
| `public/api/*.php` | Apache | API PHP (login, saldo, slot, roleta, admin) |
| `public/tema.css` | Apache | Visual comum de todas as telas de jogo (seção 6) |
| `public/jogos/<nome>/` | Apache | Um jogo por pasta |
| `public/jogos/crash/public/` | Apache **e** Node | Páginas do Crash, Laboratório e Slot-Node |
| `server.js`, `game.js`, `lib/`, `lab/` | Node (porta 3000) | API do Crash e do Laboratório |
| `tests/` | `npm test` | Testes automáticos do Node |
| `sql/` | MySQL (rodar 1 vez) | Tabelas novas: `mysql -u root lucky_charm < sql/<arquivo>.sql` |
| `_backup/` | ninguém | Arquivos antigos guardados (não editar) |

A raiz tem um `.htaccess` com `Require all denied`: **nunca coloque código de servidor dentro de `public/`.**
Não crie cópias de `server.js`/`lib/` em outras pastas: só existe uma versão, a da raiz.

## 2. Regras gerais

* Textos de tela, mensagens de erro e comentários em **português**. Nomes de variáveis e funções em
  **inglês**, em `camelCase` (JS) ou `snake_case` (PHP), como já está no código.
* Comentários curtos, explicando o **porquê** (regra de negócio, segurança), não o óbvio.
* Dinheiro:
  * **Banco/PHP**: inteiro em **centavos** (`balance = 100000` = 1.000,00).
  * **Node/Crash**: créditos com 2 casas (`10.5`). A conversão acontece **só** em `lib/wallet.js` / `server.js`.
  * Exibir com `fmt()` (`toLocaleString("pt-BR")`, 2 casas).
* Todo resultado de jogo e toda mudança de saldo acontecem **no servidor**. O navegador só mostra.
* Sessão: token em `localStorage["slot_token"]` (site e jogos) e `sessionStorage["admin_token"]` (admin).
* Login só é obrigatório nos jogos com saldo (Slot, Crash, Roleta). Menu e jogos sem aposta abrem para
  visitante (recordes guardados como `visitante`).
* Nunca deixe senhas, hashes de teste ou scripts temporários em `public/`.

## 3. JavaScript (navegador e Node)

* 2 espaços, aspas **duplas**, ponto e vírgula, vírgula no final de listas com várias linhas.
* `const` por padrão, `let` quando muda; nunca `var`. Funções de seta para callbacks.
* Atalho `const $ = (id) => document.getElementById(id);` nas páginas.
* Chamadas à API passam por uma função `api()` que envia JSON com o `token` e lança `Error` com
  `data.error` quando a resposta não é `ok` (modelo: `public/admin/admin.js`).
* Texto vindo do usuário vai em `textContent`, não em `innerHTML`.
* Node: só módulos nativos + `mysql2`. Erros de API com `throw new HttpError(status, "mensagem")`;
  o servidor responde sempre `{ "error": "mensagem" }`.

## 4. PHP (`public/api/`)

* 4 espaços, aspas **simples**, sem `?>` no final do arquivo.
* Todo endpoint começa assim e usa **só** as funções do `config.php`:

```php
<?php
require __DIR__ . '/config.php';

$user = require_user();   // ou require_admin() para o painel
$in = json_in();
// ... valida a entrada ...
json_out(['ok' => true]);
```

* Erro: `json_out(['error' => 'Mensagem'], 400)` (400 entrada inválida, 401 sessão, 403 sem permissão,
  404 não encontrado, 409 conflito, 500 erro interno).
* SQL sempre com `prepare()` + `execute([...])`. Mudança de saldo dentro de transação com
  `SELECT ... FOR UPDATE` (modelo: `admin_credit.php`, `spin.php`, `roulette.php`).
* Endpoint de admin tem nome `admin_*.php` e chama `require_admin()`.
* Regras de um jogo (pagamentos, limites) ficam num arquivo só, incluído pelo sorteio e entregue ao
  front por um endpoint de informação. Modelos: `symbols.php` + `me.php` (Slot),
  `roulette_rules.php` + `roulette_info.php` (Roleta). O front nunca repete essas regras.
* Toda rodada gravada numa tabela de histórico (`spins`, `crash_rounds`, `roulette_rounds`), com
  `user_id`, `bet`, `win`, `balance_after` em centavos. Tabela nova: crie o `.sql` em `sql/` e inclua
  o `DELETE` dela na exclusão de conta (`admin_user.php`).

## 5. HTML e CSS

* `<html lang="pt-BR">`, `<meta charset="utf-8">`, `<meta name="viewport" ...>`.
* CSS em arquivo próprio da página (não usar `style=""` para layout). Classes em `kebab-case` minúsculo.
* Scripts no fim do `<body>`, um `.js` por página.

## 6. Tela de jogo (visual padrão)

Todas as telas de jogo (Slot, Crash, Roleta, Memória, Quiz, Sapos, Forca, Cobrinha...) usam **`public/tema.css`**:
fundo, fontes, cores (`var(--gold)`, `var(--panel)`...), faixa de aviso, logo, barra do usuário, placar
(`.stats .box`), histórico (`.history` + `.chips`), instrução (`.info`), botão "Jogar de novo" (`.again`),
área do jogo com moldura (`.arena`, com aviso por cima em `.arena-msg`), mensagem final (`.result`, `.ok`, `.bad`)
e botões secundários (`.tool`, `.tool.on`).
Ordem dos CSS: `tema.css`
primeiro, depois o CSS do jogo, que só define o que é dele (e o `max-width` de `.game`).

```html
<link rel="stylesheet" href="../../tema.css">
<link rel="stylesheet" href="<nome>.css">
...
<div class="banner">DEMONSTRAÇÃO EDUCATIVA · créditos fictícios · sem dinheiro real e sem pagamentos</div>
<main class="game">
  <header class="logo">
    <h1>LUCKY CHARM <small>NOME DO JOGO</small></h1>
  </header>
  <div class="userbar">
    <span id="hUser"></span>
    <a href="../../home.html">← Voltar aos jogos</a>
  </div>
  <p class="info">Uma frase explicando como jogar.</p>
  <!-- placar, conteúdo do jogo, <p class="result">, <button class="again" hidden>Jogar de novo</button> -->
</main>
<script src="../../sessao.js"></script>   <!-- só nos jogos sem aposta -->
<script src="<nome>.js"></script>
```

* `#hUser` recebe só o nome (`me.username`); o 👤 vem do CSS.
* Placar/saldo: `<section class="stats"><div class="box"><label>SALDO</label><b id="balance">0,00</b></div>...`
  (`.box.prize` deixa o valor verde). Rótulos sempre em MAIÚSCULAS.
* Histórico: `<section class="history"><span class="hlabel">ÚLTIMOS</span><div class="chips" id="history">...`
  (o visual de cada ficha é do jogo).
* Mudança visual que vale para mais de um jogo vai no `tema.css`, nunca copiada em cada jogo. O mesmo
  vale para JavaScript: código repetido entre jogos vai para um arquivo comum (ex.: `sessao.js`).
* Jogos sem aposta usam **`public/sessao.js`**: `checkSession()` confere o login e preenche `#hUser` (sem login: "Visitante", não redireciona)
  (chame antes de começar: `checkSession().then(start)`); `saveRecord("<jogo>", valor)` guarda e devolve
  o recorde. Recorde aparece numa caixa `RECORDE` do placar.
* Texto e emoji em `<canvas>`: defina `ctx.fillStyle` opaco antes de desenhar emoji (ele herda a
  transparência da cor atual).
* O Laboratório (`lab.html`) é ferramenta do TCC e tem visual próprio (`lab.css`).

## 7. Adicionar um jogo novo

1. Crie `public/jogos/<nome>/` com `index.html`, `<nome>.css` e `<nome>.js`. Modelos:
   * sem saldo, com rodadas: `jogos/quiz/` ou `jogos/forca/`; tabuleiro contra o computador: `jogos/velha/`
   * sem saldo, em tempo real (canvas com campo de tamanho fixo e escala): `jogos/tijolos/` ou `jogos/voo/`
   * com saldo e apostas: `jogos/roleta/`
2. Monte a tela com a estrutura da seção 6.
3. Sessão: jogo sem aposta usa `checkSession()` do `sessao.js` (aceita visitante); jogo com aposta chama o `*_info.php`
   dele e volta para `../../index.html` se a resposta for 401.
4. Se o jogo mexe em saldo, crie os endpoints em `public/api/` seguindo a seção 4 (regras, info, sorteio,
   tabela de histórico).
5. Adicione o jogo na lista `JOGOS` de `public/home.html` com `cat` (categoria) e `record` (a mesma chave
   usada no `saveRecord()`, para o recorde aparecer no ícone).

## 8. Antes de entregar uma alteração

* `npm test` (35 testes do Node) tem que passar.
* PHP: `C:\xampp\php\php.exe -l arquivo.php` sem erros.
* Teste no navegador: login → home → jogo → saldo atualizado → sair.
