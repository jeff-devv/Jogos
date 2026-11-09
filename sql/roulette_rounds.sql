-- Histórico da Roleta (mesmo formato de spins / crash_rounds). Valores em centavos.
-- Rodar uma vez: C:\xampp\mysql\bin\mysql.exe -u root lucky_charm < sql\roulette_rounds.sql
CREATE TABLE IF NOT EXISTS `roulette_rounds` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `number` tinyint(4) NOT NULL,
  `bet` int(11) NOT NULL,
  `win` int(11) NOT NULL DEFAULT 0,
  `balance_after` int(11) NOT NULL,
  `bets_json` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `roulette_rounds_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
