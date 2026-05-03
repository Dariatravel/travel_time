-- Для scripts/apply-abkhazbereg-updates.cjs (точное title в БД).
-- Если строка не находится — выполните abkhazbereg-hotfix-abaza-antaa.sql в SQL Editor (там trim(title)).

UPDATE hotels SET telegram_url = 'https://абхазберег.рф/hotels/abaza-otel-3614/' WHERE title = 'Абаза';
UPDATE hotels SET telegram_url = 'https://абхазберег.рф/hotels/antaa-gostinitsa-u-sosnovogo-plyazha-2899/' WHERE title = 'Антаа';
