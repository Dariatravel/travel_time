// Короткие ссылки для карточек абхазберег.рф.
//
// По умолчанию только строит план и отчёт. Изменение файлов сайта требует
// --apply-site, а запись в Supabase одновременно --update-db и контрольную
// фразу --confirm UPDATE_SHORT_LINKS. Перед каждой записью опубликованный
// короткий URL проверяется по HTTP и сверяется с ожидаемой canonical-ссылкой.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

import {
    aliasFilePath,
    aliasHtml,
    aliasTargetFromHtml,
    buildShortSlug,
    canonicalPathForListing,
    isShortCatalogPath,
    normalizeCatalogPath,
    semanticTitleKey,
} from './lib/shortHotelLinks.mjs';

const DEFAULT_SITE_BASE = 'https://xn--80aacbklan7f0b.xn--p1ai';
const DISPLAY_ORIGIN = 'https://абхазберег.рф';
const CONFIRMATION = 'UPDATE_SHORT_LINKS';
const EXPLICITLY_SKIPPED_TITLES = new Set(['тест', 'шерамин sheramin']);

const loadEnvLocal = () => {
    const file = path.resolve('.env.local');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
    }
};

const parseArgs = () => {
    const args = process.argv.slice(2);
    const result = {
        siteDir: '',
        report: 'short-hotel-links-report.txt',
        jsonReport: 'short-hotel-links-report.json',
        siteBase: DEFAULT_SITE_BASE,
        applySite: false,
        updateDb: false,
        confirm: '',
        skipHttp: false,
    };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--site-dir') result.siteDir = path.resolve(args[++i]);
        else if (arg === '--report') result.report = args[++i];
        else if (arg === '--json-report') result.jsonReport = args[++i];
        else if (arg === '--site-base') result.siteBase = args[++i].replace(/\/$/, '');
        else if (arg === '--apply-site') result.applySite = true;
        else if (arg === '--update-db') result.updateDb = true;
        else if (arg === '--confirm') result.confirm = args[++i] ?? '';
        else if (arg === '--skip-http') result.skipHttp = true;
        else throw new Error(`Неизвестный аргумент: ${arg}`);
    }
    if (!result.siteDir) throw new Error('Укажите --site-dir с локальной копией lending_pervyi');
    if (result.updateDb && result.confirm !== CONFIRMATION) {
        throw new Error(`Запись запрещена: добавьте --confirm ${CONFIRMATION}`);
    }
    return result;
};

const readSnapshot = (siteDir) => {
    const file = path.join(siteDir, 'data', 'catalog-snapshot.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : parsed.listings;
    if (!Array.isArray(rows)) throw new Error(`Не найден listings в ${file}`);
    return rows.filter((row) => row.is_active !== false && row.slug && row.title);
};

const readAliases = (siteDir) => {
    const byShort = new Map();
    const byTarget = new Map();
    for (const section of ['hotels', 'kvartira']) {
        const sectionDir = path.join(siteDir, section);
        if (!fs.existsSync(sectionDir)) continue;
        for (const entry of fs.readdirSync(sectionDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || /-\d+$/.test(entry.name)) continue;
            const file = path.join(sectionDir, entry.name, 'index.html');
            if (!fs.existsSync(file)) continue;
            const target = aliasTargetFromHtml(fs.readFileSync(file, 'utf8'));
            if (!target) continue;
            const shortPath = `${section}/${entry.name}/`;
            byShort.set(shortPath, target);
            if (!byTarget.has(target)) byTarget.set(target, shortPath);
        }
    }
    return { byShort, byTarget };
};

const titleScore = (hotelTitle, listing) => {
    const hotelKey = semanticTitleKey(hotelTitle);
    const listingKey = semanticTitleKey(listing.title);
    if (!hotelKey || !listingKey) return 0;
    if (hotelKey === listingKey) return 100;
    if (listingKey.startsWith(hotelKey) || hotelKey.startsWith(listingKey)) return 80;
    const hotelSlug = buildShortSlug(hotelTitle);
    const listingSlug = buildShortSlug(listing.title);
    if (listingSlug.split('-').includes(hotelSlug)) return 60;
    return 0;
};

const pickListing = (hotel, listings, aliases) => {
    const currentPath = normalizeCatalogPath(hotel.telegram_url);
    if (currentPath) {
        const canonical = aliases.byShort.get(currentPath) ?? currentPath;
        const exact = listings.find((listing) => canonicalPathForListing(listing) === canonical);
        if (exact) return { listing: exact, reason: 'текущая ссылка' };
    }

    const scored = listings
        .map((listing) => ({ listing, score: titleScore(hotel.title, listing) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);
    if (!scored.length) return { listing: null, reason: 'карточка не найдена по названию' };
    if (scored.length > 1 && scored[0].score === scored[1].score) {
        return { listing: null, reason: `неоднозначное название (${scored.filter((x) => x.score === scored[0].score).length} карточки)` };
    }
    return { listing: scored[0].listing, reason: `название, score ${scored[0].score}` };
};

const reserveShortPath = (hotel, listing, aliases, reserved) => {
    const section = listing.source_kind === 'kvartira' ? 'kvartira' : 'hotels';
    const base = buildShortSlug(hotel.title);
    if (!base) return { shortPath: null, reason: 'из названия не получился slug' };

    const canonical = canonicalPathForListing(listing);
    const candidates = [`${section}/${base}/`];
    const typeQualifier = /квартир|апартамент|студи/i.test(hotel.title) ? 'kv' :
        /домик|коттедж|дом\b/i.test(hotel.title) ? 'dom' :
            /вилл/i.test(hotel.title) ? 'villa' : '';
    if (typeQualifier) candidates.push(`${section}/${base}-${typeQualifier}/`);

    for (const shortPath of candidates) {
        const existingTarget = aliases.byShort.get(shortPath);
        if (existingTarget === canonical) return { shortPath, exists: true };
        if (!existingTarget && !reserved.has(shortPath)) {
            reserved.add(shortPath);
            return { shortPath, exists: false };
        }
    }
    return { shortPath: null, reason: `короткое имя «${base}» уже занято; требуется ручное уточнение без ID` };
};

const verifyPublishedAlias = async (siteBase, shortPath, canonicalPath) => {
    const url = `${siteBase}/${shortPath}`;
    try {
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
        const body = await response.text();
        const target = aliasTargetFromHtml(body);
        return {
            ok: response.status === 200 && target === canonicalPath,
            status: response.status,
            target,
            url,
        };
    } catch (error) {
        return { ok: false, status: 0, target: null, url, error: error instanceof Error ? error.message : String(error) };
    }
};

const formatReport = (rows, summary, args) => {
    const lines = [
        'Короткие ссылки абхазберег.рф — отчёт',
        `Режим: ${args.applySite ? 'создание страниц разрешено' : 'сухой прогон страниц'}, ${args.updateDb ? 'запись в базу разрешена' : 'без записи в базу'}`,
        `Всего объектов в программе: ${summary.total}`,
        `Активных для подбора: ${summary.eligible}`,
        `Скрытых и служебных пропущено: ${summary.skipped}`,
        `Короткие ссылки оставлены как были: ${summary.kept}`,
        `Предложены новые короткие ссылки: ${summary.planned}`,
        `Созданы страницы-псевдонимы: ${summary.aliasesCreated}`,
        `Обновлено строк в Supabase: ${summary.dbUpdated}`,
        `Не удалось обработать: ${summary.failed}`,
        '',
    ];
    for (const row of rows) {
        lines.push(`${row.title}`);
        lines.push(`  Было: ${row.oldUrl || '(пусто)'}`);
        lines.push(`  Стало: ${row.newUrl || '(не определено)'}`);
        lines.push(`  Карточка: ${row.canonicalPath || '(не найдена)'}`);
        lines.push(`  Статус: ${row.status}${row.note ? ` — ${row.note}` : ''}`);
        if (row.http) lines.push(`  HTTP: ${row.http.status}${row.http.ok ? ', адрес проверен' : ', проверка не пройдена'}`);
        lines.push('');
    }
    return lines.join('\n');
};

const main = async () => {
    loadEnvLocal();
    const args = parseArgs();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: hotels, error } = await supabase.from('hotels').select('id,title,telegram_url,is_search_visible').order('title');
    if (error) throw new Error(`hotels: ${error.message}`);

    const listings = readSnapshot(args.siteDir);
    const aliases = readAliases(args.siteDir);
    const reserved = new Set(aliases.byShort.keys());
    const rows = [];
    let aliasesCreated = 0;
    let dbUpdated = 0;

    for (const hotel of hotels ?? []) {
        const oldUrl = String(hotel.telegram_url ?? '').trim();
        const normalizedTitle = String(hotel.title ?? '').trim().toLowerCase();
        if (hotel.is_search_visible === false || EXPLICITLY_SKIPPED_TITLES.has(normalizedTitle)) {
            rows.push({
                id: hotel.id, title: hotel.title, oldUrl, newUrl: oldUrl,
                canonicalPath: '', status: 'пропущено',
                note: hotel.is_search_visible === false ? 'объект скрыт из поиска и подборок' : 'служебное исключение без карточки сайта',
            });
            continue;
        }
        const oldPath = normalizeCatalogPath(oldUrl);
        if (oldPath && isShortCatalogPath(oldPath)) {
            const expectedTarget = aliases.byShort.get(oldPath);
            const http = args.skipHttp || !expectedTarget ? null : await verifyPublishedAlias(args.siteBase, oldPath, expectedTarget);
            const valid = Boolean(expectedTarget) && (args.skipHttp || http?.ok);
            rows.push({
                id: hotel.id, title: hotel.title, oldUrl, newUrl: oldUrl,
                canonicalPath: expectedTarget, status: valid ? 'оставлено' : 'ошибка',
                note: expectedTarget ? (valid ? 'существующая короткая ссылка' : 'короткая ссылка не прошла HTTP-проверку') : 'короткая ссылка отсутствует в копии сайта',
                http,
            });
            continue;
        }

        const picked = pickListing(hotel, listings, aliases);
        if (!picked.listing) {
            rows.push({ id: hotel.id, title: hotel.title, oldUrl, newUrl: '', canonicalPath: '', status: 'ошибка', note: picked.reason });
            continue;
        }

        const canonicalPath = canonicalPathForListing(picked.listing);
        const choice = reserveShortPath(hotel, picked.listing, aliases, reserved);
        if (!choice.shortPath) {
            rows.push({ id: hotel.id, title: hotel.title, oldUrl, newUrl: '', canonicalPath, status: 'ошибка', note: choice.reason });
            continue;
        }

        if (!choice.exists && args.applySite) {
            const file = aliasFilePath(args.siteDir, choice.shortPath);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, aliasHtml(canonicalPath), 'utf8');
            aliases.byShort.set(choice.shortPath, canonicalPath);
            aliasesCreated += 1;
        }

        const newUrl = `${DISPLAY_ORIGIN}/${choice.shortPath}`;
        const http = args.skipHttp ? null : await verifyPublishedAlias(args.siteBase, choice.shortPath, canonicalPath);
        let status = choice.exists ? 'готово' : args.applySite ? 'страница создана локально' : 'нужно создать страницу';
        let note = picked.reason;

        if (args.updateDb) {
            if (!http?.ok) {
                status = 'запись запрещена';
                note = 'опубликованный короткий адрес не ответил 200 или ведёт не на ту карточку';
            } else {
                const query = supabase.from('hotels').update({ telegram_url: newUrl }).eq('id', hotel.id);
                const guarded = oldUrl ? query.eq('telegram_url', oldUrl) : query.or('telegram_url.is.null,telegram_url.eq.');
                const { error: updateError } = await guarded;
                if (updateError) throw new Error(`${hotel.title}: ${updateError.message}`);
                dbUpdated += 1;
                status = 'обновлено в базе';
            }
        }

        rows.push({ id: hotel.id, title: hotel.title, oldUrl, newUrl, canonicalPath, status, note, http });
    }

    const summary = {
        total: rows.length,
        eligible: rows.filter((row) => row.status !== 'пропущено').length,
        skipped: rows.filter((row) => row.status === 'пропущено').length,
        kept: rows.filter((row) => row.status === 'оставлено').length,
        planned: rows.filter((row) => row.newUrl && row.newUrl !== row.oldUrl).length,
        aliasesCreated,
        dbUpdated,
        failed: rows.filter((row) => row.status === 'ошибка' || row.status === 'запись запрещена').length,
    };
    const report = formatReport(rows, summary, args);
    fs.writeFileSync(path.resolve(args.report), report, 'utf8');
    fs.writeFileSync(path.resolve(args.jsonReport), JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2) + '\n', 'utf8');
    console.log(report);
    if (summary.failed) process.exitCode = 2;
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
