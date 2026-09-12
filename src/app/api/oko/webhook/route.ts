import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { positive, processEvent, type OkoEventBody } from '../_lib/processEvent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Приём событий из CRM ОКО (живая связь, 12.09.2026).
 *
 * ОКО умеет слать только один тип события — client_message: каждое сообщение
 * во всех каналах (Авито, WhatsApp, Telegram, MAX, ВК), и входящее, и
 * исходящее. Пока менеджеры работают в ОКО, эти события наполняют
 * АБХАЗБИЗНЕС живой перепиской.
 *
 * Порядок важен: событие СНАЧАЛА целиком сохраняется в oko_webhook_events,
 * и только потом разбирается. Сбой РАЗБОРА — это 200: событие уже у нас,
 * его переразберёт повторная обработка. Сбой СОХРАНЕНИЯ — это 503: события
 * у нас нет, и говорить ОКО «принято» нельзя (14.09.2026, по внешнему ревью).
 *
 * ОКО повторов не делает и отключает вебхук после нескольких ошибок подряд
 * (так он и умер в августе), поэтому 503 — это тревога: сторож на Mac mini
 * следит за состоянием вебхука, а сверка добирает пропущенное из ОКО.
 */

const constantEquals = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Подпись проверяется, только если секрет задан. Тогда заголовок обязателен:
 * иначе проверку можно было бы обойти, просто не прислав подпись.
 * Пока секрет не задан, заголовки запроса сохраняются в событие — по ним
 * видно, подписывает ли ОКО запросы и как называется заголовок.
 */
const signatureOk = (raw: string, request: NextRequest): boolean => {
    const secret = process.env.OKO_WEBHOOK_SECRET;
    if (!secret) return true;
    const got =
        request.headers.get('x-signature') ??
        request.headers.get('x-oko-signature') ??
        request.headers.get('signature');
    if (!got) return false;

    return constantEquals(createHmac('sha256', secret).update(raw).digest('hex'), got.trim());
};

/** Заголовки для разбора. Токен доступа в них не попадает — он в адресе. */
const SKIP_HEADERS = new Set(['cookie', 'authorization', 'x-oko-token']);

const headersOf = (request: NextRequest): Record<string, string> => {
    const result: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        if (!SKIP_HEADERS.has(key.toLowerCase())) result[key] = value.slice(0, 300);
    });

    return result;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
    const token = process.env.OKO_WEBHOOK_TOKEN;
    const given = request.headers.get('x-oko-token') ?? request.nextUrl.searchParams.get('token') ?? '';
    if (!token || !constantEquals(token, given)) {
        return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const raw = await request.text();
    if (!signatureOk(raw, request)) {
        console.error('Вебхук ОКО: подпись не сошлась');

        return NextResponse.json({ ok: true, skipped: 'подпись не сошлась' });
    }

    let body: OkoEventBody;
    try {
        body = JSON.parse(raw) as OkoEventBody;
    } catch {
        // Проверочный запрос ОКО или мусор — отвечаем 200, иначе вебхук отключится.
        return NextResponse.json({ ok: true, skipped: 'не JSON' });
    }

    const m = body.data;
    const messageId = positive(m?.id);
    if (body.webhook_type !== 'client_message' || !m || !messageId) {
        return NextResponse.json({ ok: true, skipped: body.webhook_type ?? 'нет данных' });
    }

    const service = createSupabaseServiceRoleClient();

    // 1. Сохранить как есть, с повторами: пока событие не у нас, «принято»
    //    говорить нельзя. База могла просто просыпаться.
    let saveError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt) await sleep(300 * attempt);
        const { error } = await service
            .from('oko_webhook_events')
            .upsert(
                { oko_message_id: messageId, payload: body, headers: headersOf(request) },
                { onConflict: 'oko_message_id' },
            );
        if (!error) {
            saveError = null;
            break;
        }
        saveError = error.message;
    }
    if (saveError) {
        console.error('Вебхук ОКО: НЕ СОХРАНИЛИ событие', messageId, saveError);

        // 503: честный отказ. Молчаливое «200 ОК» потеряло бы сообщение
        // навсегда — ОКО его не повторит и никто бы не узнал.
        return NextResponse.json({ ok: false, error: 'не сохранили' }, { status: 503 });
    }

    // 2. Разобрать. Сбой разбора — не повод отвечать ошибкой: событие у нас.
    const result = await processEvent(service, messageId, body);
    if (!result.ok) {
        console.error('Вебхук ОКО: разбор не удался', messageId, result.error);

        return NextResponse.json({ ok: true, stored: true, parse_error: true });
    }

    return NextResponse.json({ ok: true, direction: result.direction });
}

export async function GET() {
    // ОКО проверяет адрес перед регистрацией.
    return NextResponse.json({ ok: true });
}
