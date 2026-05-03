-- Разовое исправление: Абаза и Антаа (совпадение по slug не попадало в старый алгоритм).
-- Удобно выполнить в Supabase → SQL Editor. trim(title) — на случай пробела в конце названия.

UPDATE hotels
SET telegram_url = 'https://абхазберег.рф/hotels/abaza-otel-3614/'
WHERE trim(title) = 'Абаза';

UPDATE hotels
SET telegram_url = 'https://абхазберег.рф/hotels/antaa-gostinitsa-u-sosnovogo-plyazha-2899/'
WHERE trim(title) = 'Антаа';
