<?php
require __DIR__ . '/config.php';

$user = require_user();
$stmt = db()->prepare('DELETE FROM sessions WHERE token = ?');
$stmt->execute([$user['token']]);

json_out(['ok' => true]);
