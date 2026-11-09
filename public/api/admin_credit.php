<?php
require __DIR__ . '/config.php';

require_admin();
$in = json_in();
$userId = (int) ($in['user_id'] ?? 0);
$amount = (int) ($in['amount'] ?? 0); // em centavos, negativo para retirar

if ($userId <= 0 || $amount === 0) {
    json_out(['error' => 'Informe o usuário e um valor diferente de zero'], 400);
}

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT balance FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$userId]);
    $current = $stmt->fetchColumn();

    if ($current === false) {
        $pdo->rollBack();
        json_out(['error' => 'Usuário não encontrado'], 404);
    }

    $newBalance = (int) $current + $amount;
    if ($newBalance < 0) {
        $pdo->rollBack();
        json_out(['error' => 'Saldo insuficiente para retirar esse valor'], 400);
    }

    $upd = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
    $upd->execute([$newBalance, $userId]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    json_out(['error' => 'Erro ao creditar'], 500);
}

json_out(['ok' => true, 'balance' => $newBalance]);
