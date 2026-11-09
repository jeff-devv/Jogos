<?php
require __DIR__ . '/config.php';

$in = json_in();
$username = trim($in['username'] ?? '');
$password = $in['password'] ?? '';

if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
    json_out(['error' => 'Usuário deve ter de 3 a 20 letras, números ou _'], 400);
}
if (strlen($password) < 6) {
    json_out(['error' => 'A senha deve ter pelo menos 6 caracteres'], 400);
}

$hash = password_hash($password, PASSWORD_BCRYPT);
try {
    $stmt = db()->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    $stmt->execute([$username, $hash]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') json_out(['error' => 'Usuário já existe'], 409);
    throw $e;
}

json_out(['ok' => true, 'message' => 'Conta criada, faça login']);
