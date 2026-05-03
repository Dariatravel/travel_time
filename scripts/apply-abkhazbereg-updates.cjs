/**
 * Применяет UPDATE из SQL-файла к таблице hotels (нужен service_role).
 *
 * По умолчанию: abkhazbereg-update-links.sql (строки WHERE id = '…').
 * Поддерживаются строки WHERE title = '…' (точное совпадение названия).
 *
 * Другой файл:
 *   node scripts/apply-abkhazbereg-updates.cjs path/to/updates.sql
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnvLocal() {
    const p = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(p)) return {};
    const o = {};
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) o[m[1].trim()] = m[2].trim();
    }
    return o;
}

async function main() {
    const env = readEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !url) {
        console.error('Нужны SUPABASE_SERVICE_ROLE_KEY и NEXT_PUBLIC_SUPABASE_URL (env или .env.local)');
        process.exit(1);
    }

    const sqlPath = process.argv[2]
        ? path.resolve(process.argv[2])
        : path.join(__dirname, '..', 'abkhazbereg-update-links.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const unesc = (s) => s.replace(/''/g, "'");
    const reId =
        /UPDATE hotels SET telegram_url = '((?:[^']|'')*)' WHERE id = '([0-9a-f-]{36})'\s*;?/gi;
    const reTitle =
        /UPDATE hotels SET telegram_url = '((?:[^']|'')*)' WHERE title = '((?:[^']|'')*)'\s*;?/gi;
    const updates = [];
    let m;
    while ((m = reId.exec(sql)) !== null) {
        updates.push({
            telegram_url: unesc(m[1]),
            id: m[2],
        });
    }
    while ((m = reTitle.exec(sql)) !== null) {
        updates.push({
            telegram_url: unesc(m[1]),
            title: unesc(m[2]),
        });
    }

    if (updates.length === 0) {
        console.error('Не найдено ни одной строки UPDATE (id или title) в', sqlPath);
        process.exit(1);
    }

    const supabase = createClient(url, key);
    let ok = 0;
    const errors = [];

    for (const u of updates) {
        let q = supabase.from('hotels').update({ telegram_url: u.telegram_url });
        if (u.id) q = q.eq('id', u.id);
        else if (u.title) q = q.eq('title', u.title);
        const { error } = await q;
        const label = u.id || u.title;
        if (error) errors.push({ target: label, message: error.message });
        else ok++;
    }

    console.log(JSON.stringify({ applied: ok, failed: errors.length, total: updates.length }, null, 2));
    if (errors.length) {
        console.error(errors.slice(0, 5));
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
