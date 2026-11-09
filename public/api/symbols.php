<?php
// Fonte única dos símbolos (animais): usada pelo sorteio e pelo front
// pay = multiplicador por linha; weight = chance relativa
$SYMBOLS = [
    ['icon' => '🐭', 'pay' => 2,   'weight' => 30], // rato
    ['icon' => '🐸', 'pay' => 3,   'weight' => 25], // sapo
    ['icon' => '🐰', 'pay' => 5,   'weight' => 18], // coelho
    ['icon' => '🦊', 'pay' => 10,  'weight' => 12], // raposa
    ['icon' => '🐯', 'pay' => 25,  'weight' => 8],  // tigre
    ['icon' => '🦁', 'pay' => 50,  'weight' => 4],  // leão
    ['icon' => '🐉', 'pay' => 100, 'weight' => 3],  // dragão
];

// Símbolo "vazio": aparece como macaco, mas NÃO paga nada e nunca forma linha
define('BLANK_ICON', '🐵');
function empty_weight() {
    $v = db()->query('SELECT setting_value FROM settings WHERE setting_key = "empty_weight"')->fetchColumn();
    return $v === false ? 15 : (int) $v;
}
