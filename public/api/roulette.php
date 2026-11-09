<?php
require __DIR__ . '/config.php';
require __DIR__ . '/roulette_rules.php';

$user = require_user();
$in = json_in();
$bets = $in['bets'] ?? null;

if (!is_array($bets) || count($bets) === 0 || count($bets) > ROULETTE_MAX_BETS) {
    json_out(['error' => 'Escolha de 1 a ' . ROULETTE_MAX_BETS . ' casas'], 400);
}

// valida cada aposta: tipo conhecido, alvo válido, valor inteiro em centavos
$clean = [];
$total = 0;
foreach ($bets as $b) {
    $type = is_array($b) ? ($b['type'] ?? '') : '';
    $amount = is_array($b) && is_int($b['amount'] ?? null) ? $b['amount'] : 0;
    if (!is_string($type) || !isset(ROULETTE_BETS[$type])) json_out(['error' => 'Aposta inválida'], 400);
    [, $targets] = ROULETTE_BETS[$type];
    $target = null;
    if ($targets !== null) {
        $target = is_int($b['target'] ?? null) ? $b['target'] : -1;
        if (!in_array($target, $targets, true)) json_out(['error' => 'Aposta inválida'], 400);
    }
    if ($amount < ROULETTE_MIN_BET) json_out(['error' => 'O valor mínimo por casa é 1,00'], 400);
    $total += $amount;
    $clean[] = ['type' => $type, 'target' => $target, 'amount' => $amount];
}
if ($total > ROULETTE_MAX_TOTAL) json_out(['error' => 'O total da rodada passa do limite de 1.000,00'], 400);

// sorteio no servidor; cada aposta vencedora devolve o valor apostado + o prêmio
$number = random_int(0, 36);
$win = 0;
$winningBets = [];
foreach ($clean as $i => $b) {
    if (roulette_wins($b['type'], $b['target'], $number)) {
        $win += $b['amount'] * (ROULETTE_BETS[$b['type']][0] + 1);
        $winningBets[] = $i;
    }
}

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$user['id']]);
    $balance = (int) $stmt->fetchColumn();

    if ($balance < $total) {
        $pdo->rollBack();
        json_out(['error' => 'Saldo insuficiente'], 400);
    }

    $newBalance = $balance - $total + $win;

    $upd = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
    $upd->execute([$newBalance, $user['id']]);

    $ins = $pdo->prepare(
        'INSERT INTO roulette_rounds (user_id, number, bet, win, balance_after, bets_json) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([$user['id'], $number, $total, $win, $newBalance, json_encode($clean)]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'Erro ao processar a rodada'], 500);
}

json_out([
    'number'      => $number,
    'color'       => roulette_color($number),
    'bet'         => $total,
    'win'         => $win,
    'winningBets' => $winningBets,
    'balance'     => $newBalance,
]);
