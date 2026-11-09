<?php
require __DIR__ . '/config.php';

$user = require_user();
$stmt = db()->prepare('UPDATE users SET balance = 100000 WHERE id = ?');
$stmt->execute([$user['id']]);

json_out(['balance' => 100000]);