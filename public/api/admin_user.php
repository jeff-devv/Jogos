<?php
// Admin: trocar senha (action = set_password) e excluir conta (action = delete)
require __DIR__ . '/config.php';

$admin = require_admin();
$in = json_in();
$action = $in['action'] ?? '';
$userId = (int) ($in['user_id'] ?? 0);

$pdo = db();
$stmt = $pdo->prepare('SELECT id, username, is_admin FROM users WHERE id = ?');
$stmt->execute([$userId]);
$target = $stmt->fetch();
if (!$target) json_out(['error' => 'Usuário não encontrado'], 404);

if ($action === 'set_password') {
    $password = (string) ($in['password'] ?? '');
    if (strlen($password) < 6) {
        json_out(['error' => 'A senha deve ter pelo menos 6 caracteres'], 400);
    }
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_BCRYPT), $userId]);
    // derruba as sessões abertas dessa conta (slot e crash)
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
    json_out(['ok' => true]);
}

if ($action === 'delete') {
    if ($userId === (int) $admin['id']) json_out(['error' => 'Você não pode excluir a sua própria conta'], 400);
    if ((int) $target['is_admin']) json_out(['error' => 'Não é permitido excluir outro administrador'], 400);

    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
        $pdo->prepare('DELETE FROM spins WHERE user_id = ?')->execute([$userId]);
        $pdo->prepare('DELETE FROM roulette_rounds WHERE user_id = ?')->execute([$userId]);
        // crash_rounds é opcional (pode não existir no banco)
        try { $pdo->prepare('DELETE FROM crash_rounds WHERE user_id = ?')->execute([$userId]); } catch (Throwable $e) {}
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_out(['error' => 'Erro ao excluir a conta'], 500);
    }
    json_out(['ok' => true]);
}

json_out(['error' => 'Ação inválida'], 400);
