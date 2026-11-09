<?php
// Fonte única das regras da Roleta (37 casas: 0 a 36): usada pelo sorteio e pelo front
// Valores em centavos; pay = quanto paga por 1 apostado (fora a aposta, que volta junto)
define('ROULETTE_MIN_BET', 100);       // 1,00 por casa
define('ROULETTE_MAX_TOTAL', 100000);  // 1.000,00 por rodada (somando todas as casas)
define('ROULETTE_MAX_BETS', 60);

// ordem das casas na roda: vermelho e preto se alternam, o 0 é verde
define('ROULETTE_WHEEL', [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]);
define('ROULETTE_RED', [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// type => [pay, alvos aceitos (null = sem alvo)]
define('ROULETTE_BETS', [
    'number' => [35, range(0, 36)],
    'dozen'  => [2, [1, 2, 3]],
    'column' => [2, [1, 2, 3]],
    'red'    => [1, null],
    'black'  => [1, null],
    'even'   => [1, null],
    'odd'    => [1, null],
    'low'    => [1, null],   // 1 a 18
    'high'   => [1, null],   // 19 a 36
]);

function roulette_color($n) {
    if ($n === 0) return 'green';
    return in_array($n, ROULETTE_RED, true) ? 'red' : 'black';
}

// A aposta ganha com o número sorteado? O 0 só ganha na aposta direta nele.
function roulette_wins($type, $target, $n) {
    if ($type === 'number') return $n === $target;
    if ($n === 0) return false;
    switch ($type) {
        case 'dozen':  return intdiv($n - 1, 12) + 1 === $target;
        case 'column': return ($n - 1) % 3 + 1 === $target;
        case 'red':    return roulette_color($n) === 'red';
        case 'black':  return roulette_color($n) === 'black';
        case 'even':   return $n % 2 === 0;
        case 'odd':    return $n % 2 === 1;
        case 'low':    return $n <= 18;
        case 'high':   return $n >= 19;
    }
    return false;
}
