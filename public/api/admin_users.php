<?php
require __DIR__ . '/config.php';

require_admin();

$rows = db()->query(
    'SELECT id, username, balance, is_admin, created_at FROM users ORDER BY id'
)->fetchAll();

$users = array_map(fn($r) => [
    'id'         => (int) $r['id'],
    'username'   => $r['username'],
    'balance'    => (int) $r['balance'],
    'is_admin'   => (int) $r['is_admin'],
    'created_at' => $r['created_at'],
], $rows);

json_out(['users' => $users]);
