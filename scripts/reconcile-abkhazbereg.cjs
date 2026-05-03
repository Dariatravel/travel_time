/**
 * Сверка всех отелей из БД (title, telegram_url) с карточками абхазберег.рф.
 *
 * Запуск (полный список из Supabase, обходит RLS):
 *   SUPABASE_SERVICE_ROLE_KEY="<service_role из Dashboard → Settings → API>" \
 *   node scripts/reconcile-abkhazbereg.cjs
 *
 * Либо без service role — JSON из Table Editor (экспорт таблицы hotels):
 *   node scripts/reconcile-abkhazbereg.cjs --input hotels-export.json
 *
 * Формат hotels-export.json: [{ "id": "...", "title": "...", "telegram_url": "..." }, ...]
 *
 * Выход: ../abkhazbereg-full-reconciliation.txt и ../abkhazbereg-update-links.sql
 *
 * Учитывается совпадение латинизации названия с первым словом slug на сайте (например Абаза ↔ abaza-otel-…),
 * т.к. ID поста в t.me/abhazbooking/N не совпадает с числом в URL карточки на сайте.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SITEMAP_URL = 'https://xn--80aacbklan7f0b.xn--p1ai/sitemap.xml';
const DOMAIN_DISPLAY = 'абхазберег.рф';
const SKIP_TITLE_SUBSTRINGS = ['шерамин', 'sheramin'];

/** Когда несколько карточек с одним префиксом slug — верный путь на абхазберег.рф (проверено вручную). */
const MANUAL_PATH_BY_TITLE_NORM = {
    ривьера: 'hotels/rivera-gostinitsa-vidovaya-2706/',
    тис: 'hotels/tis-mini-otel-u-zapovednika-3381/',
};

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

async function fetchSitemapUrls() {
    const res = await fetch(SITEMAP_URL);
    if (!res.ok) throw new Error(`Sitemap ${res.status}`);
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    return urls;
}

/** Путь вида /hotels/slug-1234/ или /kvartira/slug-1234/ → { section, slug, id } */
function parseCatalogPath(urlStr) {
    try {
        const u = new URL(urlStr);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        const section = parts[0];
        if (section !== 'hotels' && section !== 'kvartira') return null;
        const last = parts[parts.length - 1];
        const idMatch = last.match(/-(\d+)$/);
        if (!idMatch) return null;
        const id = parseInt(idMatch[1], 10);
        const slug = last;
        return { section, slug, id, path: `${section}/${slug}/` };
    } catch {
        return null;
    }
}

function normalizeTitle(s) {
    return (s || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/«|»|"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function slugTokens(slug) {
    return slug
        .replace(/-\d+$/, '')
        .split('-')
        .filter((t) => t.length > 2);
}

/** Простая латинизация кириллицы для сопоставления со slug (пегас → pegas). */
function latinizeRuLoose(s) {
    const m = {
        а: 'a',
        б: 'b',
        в: 'v',
        г: 'g',
        д: 'd',
        е: 'e',
        ё: 'e',
        ж: 'zh',
        з: 'z',
        и: 'i',
        й: 'y',
        к: 'k',
        л: 'l',
        м: 'm',
        н: 'n',
        о: 'o',
        п: 'p',
        р: 'r',
        с: 's',
        т: 't',
        у: 'u',
        ф: 'f',
        х: 'h',
        ц: 'c',
        ч: 'ch',
        ш: 'sh',
        щ: 'sch',
        ъ: '',
        ы: 'y',
        ь: '',
        э: 'e',
        ю: 'yu',
        я: 'ya',
    };
    return [...(s || '')].map((c) => m[c] ?? c).join('');
}

function scoreTitleSlug(titleNorm, slug) {
    const words = new Set(titleNorm.split(/[^a-zа-я0-9]+/i).filter((w) => w.length > 1));
    const lat = latinizeRuLoose(titleNorm).replace(/\s+/g, '');
    const tokens = slugTokens(slug);
    let hit = 0;
    for (const t of tokens) {
        if (words.has(t)) hit++;
        const tl = t.length > 2 && lat.includes(t) ? 0.85 : 0;
        hit += tl;
        for (const w of words) {
            if (w.includes(t) || t.includes(w)) hit += 0.25;
        }
    }
    return hit / Math.max(tokens.length, 1);
}

function sanitizeTelegramUrl(s) {
    if (!s || typeof s !== 'string') return '';
    let t = s.trim();
    t = t.replace(/^https?:\/\/https?:\/\//i, 'https://');
    if (t === 'https://t.me/' || t === 'http://t.me/') return '';
    return t;
}

/** Путь каталога hotels/slug/ или kvartira/slug/ из полной ссылки на абхазберег.рф */
function catalogPathFromStoredUrl(telegramUrl) {
    const u = sanitizeTelegramUrl(telegramUrl);
    if (!u || !/^https?:/i.test(u)) return null;
    try {
        const url = new URL(u);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && (parts[0] === 'hotels' || parts[0] === 'kvartira')) {
            return `${parts[0]}/${parts[1]}/`;
        }
    } catch (_) {}
    return null;
}

/** ID из путей abhazbooking/N, abhkvartira/N и хвоста ...-1234/ в URL сайта или t.me. */
function extractCatalogIdsFromTelegramUrl(telegramUrl) {
    const u = sanitizeTelegramUrl(telegramUrl);
    if (!u) return [];
    const ids = new Set();
    for (const m of u.matchAll(/(?:abhazbooking|abhkvartira)\/(\d+)/gi)) {
        ids.add(parseInt(m[1], 10));
    }
    try {
        const url = new URL(/^https?:/i.test(u) ? u : `https://${u}`);
        const pathMatch = url.pathname.match(/-(\d+)\/?$/);
        if (pathMatch) ids.add(parseInt(pathMatch[1], 10));
    } catch (_) {
        const pathMatch2 = u.match(/(?:hotels|kvartira)\/[^?\s]*-(\d+)\/?/i);
        if (pathMatch2) ids.add(parseInt(pathMatch2[1], 10));
    }
    return [...ids];
}

function buildIdIndex(parsedEntries) {
    const byId = new Map();
    for (const e of parsedEntries) {
        if (!byId.has(e.id)) byId.set(e.id, []);
        byId.get(e.id).push(e);
    }
    return byId;
}

function pickByTitle(title, candidates) {
    if (candidates.length === 1) return candidates[0];
    const t = normalizeTitle(title);
    const prefersKvartira =
        t.includes('квартир') || t.includes('апарт') || t.includes('студи');
    const kv = candidates.filter((c) => c.section === 'kvartira');
    const ht = candidates.filter((c) => c.section === 'hotels');
    if (prefersKvartira && kv.length === 1) return kv[0];
    if (!prefersKvartira && ht.length === 1) return ht[0];
    // максимум по похожести slug
    let best = candidates[0];
    let bestScore = -1;
    for (const c of candidates) {
        const sc = scoreTitleSlug(t, c.slug);
        if (sc > bestScore) {
            bestScore = sc;
            best = c;
        }
    }
    return best;
}

function matchByTelegramUsername(telegramUrl, title, allParsed) {
    const u = sanitizeTelegramUrl(telegramUrl);
    const m = u.match(/t\.me\/([A-Za-z0-9_]+)/i);
    if (!m) return null;
    const user = m[1].toLowerCase();
    if (user === 'hotelpegas') {
        const peg = allParsed.find((e) => /^pegas-/.test(e.slug));
        if (peg)
            return {
                status: 'MATCH_CHANNEL',
                path: peg.path,
                note: 'Канал t.me/hotelpegas',
            };
    }
    return null;
}

/** Латиница названия без пробелов — для сопоставления с первым токеном slug (Абаза ↔ abaza-otel-…). */
function latinTitleCompact(title) {
    const nt = normalizeTitle(title || '');
    return latinizeRuLoose(nt).replace(/\s+/g, '');
}

/**
 * Пост Telegram abhazbooking/N не совпадает с ID в URL на сайте (...-3614).
 * Короткие названия дают низкий fuzzy-score (деление на число слов в длинном slug).
 */
function matchByFirstSlugToken(title, allParsed) {
    const lat = latinTitleCompact(title);
    if (lat.length < 3) return null;
    const candidates = allParsed.filter((e) => {
        const tokens = slugTokens(e.slug);
        return tokens.length > 0 && tokens[0] === lat;
    });
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
        return {
            status: 'MATCH_ID',
            path: candidates[0].path,
            note: 'Совпадение по латинизации названия и первому слову slug на сайте',
        };
    }
    const picked = pickByTitle(title, candidates);
    return {
        status: 'MATCH_FUZZY',
        path: picked.path,
        note: `Несколько карточек с префиксом «${lat}» в slug, выбрано по заголовку`,
    };
}

function matchHotel(row, byId, allParsed) {
    const title = row.title || '';
    const tnorm = normalizeTitle(title);
    for (const s of SKIP_TITLE_SUBSTRINGS) {
        if (tnorm.includes(s)) {
            return { status: 'SKIP', note: 'Исключено (нет карточки на сайте / по договорённости)', path: null };
        }
    }

    const manualRel = MANUAL_PATH_BY_TITLE_NORM[tnorm];
    if (manualRel) {
        const hit = allParsed.find((e) => e.path === manualRel);
        if (hit) {
            return {
                status: 'MATCH_ID',
                path: hit.path,
                note: 'Путь на сайте зафиксирован вручную (несколько карточек с тем же префиксом в slug)',
            };
        }
    }

    const rawUrl = row.telegram_url || '';

    const existingPath = catalogPathFromStoredUrl(rawUrl);
    if (existingPath) {
        const hit = allParsed.find((e) => e.path === existingPath);
        if (hit) {
            return {
                status: 'MATCH_ID',
                path: hit.path,
                note: 'Ссылка уже на карточку абхазберег.рф',
            };
        }
    }

    const postIds = extractCatalogIdsFromTelegramUrl(rawUrl);
    for (const postId of postIds) {
        if (byId.has(postId)) {
            const picked = pickByTitle(title, byId.get(postId));
            return {
                status: 'MATCH_ID',
                path: picked.path,
                note: `Совпадение по числовому ID в ссылке Telegram (${postId})`,
            };
        }
    }

    const byUser = matchByTelegramUsername(rawUrl, title, allParsed);
    if (byUser) return byUser;

    const bySlugHead = matchByFirstSlugToken(title, allParsed);
    if (bySlugHead) return bySlugHead;

    let best = null;
    let bestScore = 0;
    const nt = normalizeTitle(title);
    for (const e of allParsed) {
        const sc = scoreTitleSlug(nt, e.slug);
        if (sc > bestScore) {
            bestScore = sc;
            best = e;
        }
    }
    if (best && bestScore >= 0.48) {
        return {
            status: 'MATCH_FUZZY',
            path: best.path,
            note: `Нечёткое совпадение по slug (score ${bestScore.toFixed(2)}), проверьте вручную`,
        };
    }

    return {
        status: 'UNMATCHED',
        path: null,
        note: 'Нет уверенного совпадения — уточните название или URL на абхазберег.рф',
    };
}

function parseArgs() {
    const args = process.argv.slice(2);
    const out = { input: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            out.input = args[i + 1];
            i++;
        }
    }
    return out;
}

async function loadHotelsFromSupabase(url, serviceKey) {
    const supabase = createClient(url, serviceKey);
    const { data, error } = await supabase
        .from('hotels')
        .select('id,title,telegram_url')
        .order('title', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function main() {
    const env = readEnvLocal();
    const args = parseArgs();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

    let hotels;
    if (args.input) {
        const raw = fs.readFileSync(path.resolve(args.input), 'utf8');
        hotels = JSON.parse(raw);
        if (!Array.isArray(hotels)) throw new Error('JSON должен быть массивом объектов');
    } else if (serviceKey && supabaseUrl) {
        hotels = await loadHotelsFromSupabase(supabaseUrl, serviceKey);
    } else {
        console.error(
            'Нужен либо SUPABASE_SERVICE_ROLE_KEY (в env или .env.local), либо --input hotels.json',
        );
        process.exit(1);
    }

    const urls = await fetchSitemapUrls();
    const parsed = urls.map(parseCatalogPath).filter(Boolean);
    const byId = buildIdIndex(parsed);

    const lines = [];
    const sql = [
        '-- Сгенерировано scripts/reconcile-abkhazbereg.cjs',
        '-- Только MATCH_ID и MATCH_CHANNEL (MATCH_FUZZY — в abkhazbereg-update-links-fuzzy.sql)',
        '-- telegram_url в приложении: полные URL с https://',
        '',
    ];

    const sqlFuzzy = [
        '-- Отложено: MATCH_FUZZY — проверьте вручную перед применением.',
        '-- telegram_url в приложении: полные URL с https://',
        '',
    ];

    lines.push(`Полная сверка объектов программы с ${DOMAIN_DISPLAY}`);
    lines.push(`Всего отелей в выгрузке: ${hotels.length}`);
    lines.push(`Карточек hotels/kvartira в sitemap: ${parsed.length}`);
    lines.push('');
    lines.push('Шерамин / SherAmin — пропускаем по вашему указанию (нет на сайте).');
    lines.push('');
    lines.push('Формат ссылки в тексте: без https://, домен кириллицей.');
    lines.push('');

    let i = 0;
    for (const row of hotels) {
        i++;
        const m = matchHotel(row, byId, parsed);
        const oldUrl = row.telegram_url || '(пусто)';
        const newDisplay =
            m.path != null ? `${DOMAIN_DISPLAY}/${m.path}` : '— не определено —';
        const newHttps = m.path != null ? `https://${DOMAIN_DISPLAY}/${m.path}` : null;

        lines.push(`${i}. ${row.title || '(без названия)'}`);
        lines.push(`   Было: ${oldUrl}`);
        lines.push(`   Сайт: ${newDisplay}`);
        lines.push(`   Статус: ${m.status}${m.note ? ` — ${m.note}` : ''}`);
        lines.push('');

        if (newHttps && row.id) {
            const oldNorm = sanitizeTelegramUrl(row.telegram_url || '').replace(/\/+$/, '');
            const newNorm = newHttps.replace(/\/+$/, '');
            const isNoop = oldNorm === newNorm;

            const line = `UPDATE hotels SET telegram_url = '${newHttps.replace(/'/g, "''")}' WHERE id = '${row.id}'; -- ${(row.title || '').replace(/'/g, "''")}`;
            if (!isNoop && (m.status === 'MATCH_ID' || m.status === 'MATCH_CHANNEL')) {
                sql.push(line);
            } else if (m.status === 'MATCH_FUZZY') {
                sqlFuzzy.push(line);
            }
        }
    }

    const outTxt = path.join(__dirname, '..', 'abkhazbereg-full-reconciliation.txt');
    const outSql = path.join(__dirname, '..', 'abkhazbereg-update-links.sql');
    const outSqlFuzzy = path.join(__dirname, '..', 'abkhazbereg-update-links-fuzzy.sql');
    fs.writeFileSync(outTxt, lines.join('\n'), 'utf8');
    fs.writeFileSync(outSql, sql.join('\n'), 'utf8');
    fs.writeFileSync(outSqlFuzzy, sqlFuzzy.join('\n'), 'utf8');
    console.log(`Written ${outTxt}`);
    console.log(`Written ${outSql} (only MATCH_ID + MATCH_CHANNEL)`);
    console.log(`Written ${outSqlFuzzy} (MATCH_FUZZY — не применено)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
