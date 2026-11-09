<?php
require __DIR__ . '/config.php';

$in = json_in();
$username = trim($in['username'] ?? '');
$password = $in['password'] ?? '';

$stmt = db()->prepare('SELECT id, password_hash FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_out(['error' => 'Usuário ou senha incorretos'], 401);
}

$token = bin2hex(random_bytes(32));
$stmt = db()->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
$stmt->execute([$token, $user['id'], time() + SESSION_TTL]);

json_out(['token' => $token]);
