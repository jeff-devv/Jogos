<?php
require __DIR__ . '/config.php';

require_admin();
$in = json_in();

// lê ou grava a configuração de chance de vazio
if (isset($in['empty_weight'])) {
    $w = (int) $in['empty_weight'];
    if ($w < 0 || $w > 500) json_out(['error' => 'Valor entre 0 e 500'], 400);
    $stmt = db()->prepare(
        'INSERT INTO settings (setting_key, setting_value) VALUES ("empty_weight", ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    );
    $stmt->execute([(string) $w]);
}

$v = db()->query('SELECT setting_value FROM settings WHERE setting_key = "empty_weight"')->fetchColumn();
json_out(['empty_weight' => (int) ($v === false ? 15 : $v)]);
