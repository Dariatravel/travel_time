import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Разбор временных карточек клиентов.
 *
 * Живые сообщения из ОКО, пришедшие до загрузки связей, завели временные
 * карточки. Теперь связи есть, и большинство таких карточек однозначно
 * сводится с настоящим клиентом по совпадению идентификатора переписки.
 *
 *  GET  — сухой прогон: что будет сведено, что останется руками. Ничего не меняет.
 *  POST — сведение однозначных пар. Требует {"confirm": "свести"} в теле,
 *         чтобы случайный запрос не удалил карточки.
 *
 * Только для администратора.
 */

type MatchRow = {
    temp_id: string;
    temp_name: string | null;
    temp_messages: number;
    real_id: string | null;
    real_name: string | null;
    real_contact_id: number | null;
    candidates: number;
    phone_match: boolean | null;
};

const summarize = (rows: MatchRow[]) => {
    const ready = rows.filter((r) => r.candidates === 1 && r.real_id);
    const ambiguous = rows.filter((r) => r.candidates > 1);
    const alone = rows.filter((r) => r.candidates === 0);

    return {
        всего_временных: rows.length,
        сведётся: ready.length,
        сведётся_сообщений: ready.reduce((sum, r) => sum + Number(r.temp_messages ?? 0), 0),
        совпал_и_телефон: ready.filter((r) => r.phone_match).length,
        несколько_кандидатов: ambiguous.length,
        без_кандидата: alone.length,
    };
};

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    try {
        const service = createSupabaseServiceRoleClient();
        const { data, error } = await service.rpc('oko_temp_card_matches');
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as MatchRow[];

        return NextResponse.json({
            ok: true,
            сводка: summarize(rows),
            примеры: rows.filter((r) => r.candidates === 1).slice(0, 20),
            спорные: rows.filter((r) => r.candidates > 1).slice(0, 20),
        });
    } catch (error) {
        return toErrorResponse(error, 'Не удалось построить отчёт по временным карточкам');
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    try {
        const body = (await request.json().catch(() => ({}))) as { confirm?: string };
        if (body.confirm !== 'свести') {
            return NextResponse.json(
                { error: 'Нужно подтверждение: {"confirm": "свести"}' },
                { status: 400 },
            );
        }

        const service = createSupabaseServiceRoleClient();
        const { data: before, error: beforeError } = await service.rpc('oko_temp_card_matches');
        if (beforeError) throw new Error(beforeError.message);
        const plan = summarize((before ?? []) as MatchRow[]);

        const { data, error } = await service.rpc('oko_merge_temp_cards');
        if (error) throw new Error(error.message);

        return NextResponse.json({ ok: true, план: plan, сведено: data ?? 0 });
    } catch (error) {
        return toErrorResponse(error, 'Не удалось свести временные карточки');
    }
}
