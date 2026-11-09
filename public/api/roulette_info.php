<?php
require __DIR__ . '/config.php';
require __DIR__ . '/roulette_rules.php';

$user = require_user();

$pays = array_map(fn($b) => $b[0], ROULETTE_BETS);

json_out([
    'username' => $user['username'],
    'balance'  => (int) $user['balance'],
    'minBet'   => ROULETTE_MIN_BET,
    'maxTotal' => ROULETTE_MAX_TOTAL,
    'maxBets'  => ROULETTE_MAX_BETS,
    'wheel'    => ROULETTE_WHEEL,
    'red'      => ROULETTE_RED,
    'pays'     => $pays,
]);
