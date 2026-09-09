import { NextRequest, NextResponse } from 'next/server';

import { requireStaff } from '../_lib/requireStaff';

export const dynamic = 'force-dynamic';

/**
 * Список объектов для опроса — ровно то, что сейчас опубликовано на сайте
 * абхазберег.рф (публичный индекс каталога, обновляется автосинком).
 * Берём с сайта, а не из Travel Time: на сайте — все объекты, с которыми
 * команда работает, включая квартиры.
 */
const CATALOG_INDEX_URL = 'https://xn--80aacbklan7f0b.xn--p1ai/data/catalog-index.json';

export type SurveyObject = {
    slug: string;
    kind: 'hotel' | 'kvartira';
    title: string;
    city: string;
    summary: string;
    location: string;
    coverUrl: string | null;
    pageUrl: string;
};

type CatalogRow = {
    slug?: string;
    source_kind?: string;
    title?: string;
    summary?: string;
    location_text?: string;
    cover_url?: string;
    page_url?: string;
};

const cityOf = (row: CatalogRow): string => {
    const location = String(row.location_text ?? '').trim();
    const summary = String(row.summary ?? '').trim();
    const source = location || summary;
    // «Лдзаа, ул. Рыбзаводская, 80» → «Лдзаа»; «Гагра. 4 минуты…» → «Гагра».
    const first = source.split(/[,.]/)[0]?.trim() ?? '';
    return first || 'Без города';
};

export async function GET(request: NextRequest) {
    const auth = await requireStaff(request);
    if ('error' in auth && auth.error) {
        return auth.error;
    }

    try {
        const response = await fetch(CATALOG_INDEX_URL, {
            headers: { 'User-Agent': 'travel-time-survey/1.0' },
            next: { revalidate: 3600 },
        });
        if (!response.ok) {
            return NextResponse.json(
                { error: `Сайт ответил ${response.status} — попробуйте позже` },
                { status: 502 },
            );
        }
        const payload = (await response.json()) as CatalogRow[] | { listings?: CatalogRow[] };
        const rows: CatalogRow[] = Array.isArray(payload) ? payload : (payload.listings ?? []);

        const objects: SurveyObject[] = rows
            .filter((row) => row.slug && row.title)
            .map((row): SurveyObject => ({
                slug: String(row.slug),
                kind: row.source_kind === 'hotel' ? 'hotel' : 'kvartira',
                title: String(row.title),
                city: cityOf(row),
                summary: String(row.summary ?? ''),
                location: String(row.location_text ?? ''),
                coverUrl: row.cover_url ? String(row.cover_url) : null,
                pageUrl: String(
                    row.page_url ??
                        `https://абхазберег.рф/${row.source_kind === 'hotel' ? 'hotels' : 'kvartira'}/${row.slug}/`,
                ),
            }))
            // Отели первыми, внутри — по городу и названию: так удобнее идти по списку.
            .sort(
                (a, b) =>
                    (a.kind === b.kind ? 0 : a.kind === 'hotel' ? -1 : 1) ||
                    a.city.localeCompare(b.city, 'ru') ||
                    a.title.localeCompare(b.title, 'ru'),
            );

        return NextResponse.json({ objects, fetchedAt: new Date().toISOString() });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Не удалось загрузить список с сайта: ${message}` },
            { status: 502 },
        );
    }
}
