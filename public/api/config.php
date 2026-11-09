<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'lucky_charm');
define('DB_USER', 'root');
define('DB_PASS', '');

define('SESSION_TTL', 60 * 60 * 24);
define('MIN_BET', 1000);
define('MAX_BET_LEVELS', [1000, 2000, 5000, 10000]);

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function json_out($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_in() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_user() {
    $in = json_in();
    $token = $in['token'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
        json_out(['error' => 'Sessão inválida'], 401);
    }
    $stmt = db()->prepare(
        'SELECT u.id, u.username, u.balance, u.is_admin
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?'
    );
    $stmt->execute([$token, time()]);
    $user = $stmt->fetch();
    if (!$user) json_out(['error' => 'Sessão inválida'], 401);
    $user['token'] = $token;
    return $user;
}

// Só usuários com is_admin = 1 passam daqui
function require_admin() {
    $user = require_user();
    if (!(int) $user['is_admin']) json_out(['error' => 'Acesso negado'], 403);
    return $user;
}
