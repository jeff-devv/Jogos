<?php
require __DIR__ . '/config.php';
require __DIR__ . '/symbols.php';

$user = require_user();

$publicSymbols = array_map(fn($s) => ['icon' => $s['icon'], 'pay' => $s['pay']], $SYMBOLS);

json_out([
    'username' => $user['username'],
    'balance'  => (int) $user['balance'],
    'bets'     => MAX_BET_LEVELS,
    'symbols'  => $publicSymbols,
    'blank'    => BLANK_ICON, // o macaco: não paga nada
]);
