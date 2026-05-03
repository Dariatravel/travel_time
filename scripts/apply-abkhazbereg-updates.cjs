/**
 * Применяет UPDATE из abkhazbereg-update-links.sql к таблице hotels (нужен service_role).
 *
 *   SUPABASE_SERVICE_ROLE_KEY="..." NEXT_PUBLIC_SUPABASE_URL="https://....supabase.co" \
 *     node scripts/apply-abkhazbereg-updates.cjs
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

    const sqlPath = path.join(__dirname, '..', 'abkhazbereg-update-links.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const re =
        /UPDATE hotels SET telegram_url = '((?:[^']|'')*)' WHERE id = '([0-9a-f-]{36})'/gi;
    const updates = [];
    let m;
    while ((m = re.exec(sql)) !== null) {
        updates.push({
            telegram_url: m[1].replace(/''/g, "'"),
            id: m[2],
        });
    }

    if (updates.length === 0) {
        console.error('Не найдено ни одной строки UPDATE в', sqlPath);
        process.exit(1);
    }

    const supabase = createClient(url, key);
    let ok = 0;
    const errors = [];

    for (const u of updates) {
        const { error } = await supabase
            .from('hotels')
            .update({ telegram_url: u.telegram_url })
            .eq('id', u.id);
        if (error) errors.push({ id: u.id, message: error.message });
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
