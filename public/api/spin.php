<?php
require __DIR__ . '/config.php';
require __DIR__ . '/symbols.php';

$user = require_user();
$in = json_in();
$bet = (int) ($in['bet'] ?? 0);

if (!in_array($bet, MAX_BET_LEVELS, true)) {
    json_out(['error' => 'Aposta inválida'], 400);
}

function pick_symbol($symbols, $emptyWeight) {
    $total = $emptyWeight;
    foreach ($symbols as $s) $total += $s['weight'];
    $r = random_int(1, $total);
    if ($r <= $emptyWeight) return null;
    $r -= $emptyWeight;
    foreach ($symbols as $s) {
        if ($r <= $s['weight']) return $s;
        $r -= $s['weight'];
    }
    return null;
}

$grid = [];
for ($row = 0; $row < 3; $row++) {
    $grid[$row] = [];
    for ($col = 0; $col < 3; $col++) {
        $s = pick_symbol($SYMBOLS, empty_weight());
        $grid[$row][$col] = $s ? $s['icon'] : BLANK_ICON;
    }
}

// Só conta linha de símbolos pagantes; o macaco nunca paga
$winTotal = 0;
$winningLines = [];
$perLine = intdiv($bet, 3);
for ($row = 0; $row < 3; $row++) {
    $a = $grid[$row][0];
    if ($a !== BLANK_ICON && $a === $grid[$row][1] && $a === $grid[$row][2]) {
        foreach ($SYMBOLS as $s) {
            if ($s['icon'] === $a) {
                $winTotal += $s['pay'] * $perLine;
                break;
            }
        }
        $winningLines[] = $row;
    }
}

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$user['id']]);
    $balance = (int) $stmt->fetchColumn();

    if ($balance < $bet) {
        $pdo->rollBack();
        json_out(['error' => 'Saldo insuficiente'], 400);
    }

    $newBalance = $balance - $bet + $winTotal;

    $upd = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
    $upd->execute([$newBalance, $user['id']]);

    $ins = $pdo->prepare('INSERT INTO spins (user_id, bet, win, balance_after) VALUES (?, ?, ?, ?)');
    $ins->execute([$user['id'], $bet, $winTotal, $newBalance]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'Erro ao processar o giro'], 500);
}

json_out([
    'grid'         => $grid,
    'win'          => $winTotal,
    'winningLines' => $winningLines,
    'balance'      => $newBalance,
]);
