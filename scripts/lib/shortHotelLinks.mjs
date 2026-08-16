import path from 'node:path';

const RU_TO_LATIN = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const GENERIC_WORDS = new Set([
    'hotel', 'otel', 'mini', 'gostevoy', 'gostevoi', 'gostinitsa', 'dom', 'doma', 'domik',
    'domiki', 'kvartira', 'kvartiry', 'apartamenty', 'apart', 'kompleks', 'kottedzh',
    'kottedzhi', 'nomer', 'nomera', 'villa', 'baza', 'otdyha', 'eko', 'afreym', 'afreymy',
]);

export const transliterate = (value) =>
    [...String(value ?? '').toLowerCase()].map((char) => RU_TO_LATIN[char] ?? char).join('');

export const slugify = (value) =>
    transliterate(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');

export const extractObjectName = (title) => {
    const source = String(title ?? '').trim();
    const quoted = source.match(/[«"]\s*([^»"]+?)\s*[»"]/);
    if (quoted?.[1]) return quoted[1].trim();

    const tokens = slugify(source).split('-').filter(Boolean);
    const typeIndex = tokens.findIndex((token) => GENERIC_WORDS.has(token));
    const nameTokens = typeIndex > 0 ? tokens.slice(0, typeIndex) : tokens;
    const numericNameTokens = tokens.filter((token) => /^\d+$/.test(token) && !nameTokens.includes(token));
    const meaningful = [
        ...nameTokens.filter((token) => !GENERIC_WORDS.has(token) && !/^\d+k$/.test(token)),
        ...numericNameTokens,
    ];
    return meaningful.join(' ') || source;
};

export const buildShortSlug = (title) => slugify(extractObjectName(title));

export const normalizeCatalogPath = (value) => {
    if (!value) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(value) ? value : `https://example.test/${value}`);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 2 || !['hotels', 'kvartira'].includes(parts[0])) return null;
        return `${parts[0]}/${parts[1]}/`;
    } catch {
        return null;
    }
};

export const isShortCatalogPath = (catalogPath) => {
    const normalized = normalizeCatalogPath(catalogPath);
    if (!normalized) return false;
    const slug = normalized.split('/')[1];
    return !/-\d+$/.test(slug);
};

export const canonicalPathForListing = (listing) => {
    const section = listing.source_kind === 'kvartira' ? 'kvartira' : 'hotels';
    return `${section}/${listing.slug}/`;
};

export const aliasHtml = (targetPath) => {
    const normalized = normalizeCatalogPath(targetPath);
    if (!normalized) throw new Error(`Некорректный путь карточки: ${targetPath}`);
    const href = `/${normalized}`;
    return `<!DOCTYPE html>\n<html lang="ru"><head><meta charset="utf-8"/>\n` +
        `<meta http-equiv="refresh" content="0;url=${href}"/>\n` +
        `<link rel="canonical" href="https://абхазберег.рф${href}"/>\n` +
        '<meta name="robots" content="noindex"/>\n' +
        '<title>Перенаправление</title></head>\n' +
        `<body><p>Короткая ссылка: <a href="${href}">открыть страницу объекта</a>.</p></body></html>\n`;
};

export const aliasFilePath = (siteDir, shortPath) => {
    const normalized = normalizeCatalogPath(shortPath);
    if (!normalized || !isShortCatalogPath(normalized)) {
        throw new Error(`Некорректный короткий путь: ${shortPath}`);
    }
    return path.join(siteDir, normalized, 'index.html');
};

export const aliasTargetFromHtml = (html) => {
    const match = String(html).match(/http-equiv=["']refresh["'][^>]+content=["']0\s*;\s*url=\/((?:hotels|kvartira)\/[^"']+)["']/i);
    return normalizeCatalogPath(match?.[1] ?? '');
};

export const semanticTitleKey = (title) => buildShortSlug(title).replace(/-/g, '');
