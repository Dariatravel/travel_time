import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import { toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Импорт из OKO пачками: страница «Импорт» читает подготовленные файлы
 * (clients/deals/messages.jsonl) в браузере и шлёт сюда по 500 строк.
 * Строки пишутся upsert-ом по идентификатору OKO — повторный импорт не
 * создаёт дублей. Последний шаг `link` связывает сделки с клиентами и
 * сообщения со сделками одной SQL-функцией.
 */

const MAX_ROWS = 1000;

type Table = 'clients' | 'deals' | 'deal_messages';

const TABLES: Record<Table, { conflict: string; columns: string[] }> = {
    clients: {
        conflict: 'oko_contact_id',
        columns: ['oko_contact_id', 'name', 'phones', 'emails', 'responsible', 'telegram_user_id', 'oko_created_at', 'oko_url'],
    },
    deals: {
        conflict: 'oko_lead_id',
        columns: [
            'oko_lead_id', 'oko_contact_id', 'title', 'pipeline', 'stage', 'source', 'responsible',
            'hotel_full', 'hotel_title', 'check_in', 'check_out', 'people', 'price_per_night', 'nights',
            'service_note', 'total', 'prepaid', 'to_pay', 'payment_bank', 'payment_date', 'comment',
            'refund_amount', 'penalty', 'oko_created_at', 'oko_updated_at', 'oko_closed_at',
            'arrived_stage_at', 'oko_url',
        ],
    },
    deal_messages: {
        conflict: 'oko_message_id',
        columns: ['oko_message_id', 'oko_lead_id', 'direction', 'author_type', 'author_name', 'integration_id', 'text', 'files', 'sent_at'],
    },
};

const pick = (row: Record<string, unknown>, columns: string[]) =>
    Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]));

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    try {
        const body = (await request.json()) as { table?: string; rows?: unknown; action?: string };
        const service = createSupabaseServiceRoleClient();

        if (body.action === 'link') {
            const { data, error } = await service.rpc('crm_link_imported');
            if (error) throw new Error(`link: ${error.message}`);
            const row = Array.isArray(data) ? data[0] : data;

            return NextResponse.json({ ok: true, ...(row ?? {}) });
        }

        const table = body.table as Table;
        if (!(table in TABLES)) return NextResponse.json({ error: 'Неизвестная таблица' }, { status: 400 });
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
            return NextResponse.json({ error: 'Нет строк' }, { status: 400 });
        }
        if (body.rows.length > MAX_ROWS) {
            return NextResponse.json({ error: `Не больше ${MAX_ROWS} строк за раз` }, { status: 413 });
        }

        const spec = TABLES[table];
        const rows = (body.rows as Record<string, unknown>[])
            .filter((row) => row && typeof row === 'object' && row[spec.conflict] != null)
            .map((row) => pick(row, spec.columns));
        if (rows.length === 0) return NextResponse.json({ ok: true, written: 0 });

        const { error } = await service.from(table).upsert(rows, { onConflict: spec.conflict, ignoreDuplicates: false });
        if (error) throw new Error(`${table}: ${error.message}`);

        return NextResponse.json({ ok: true, written: rows.length });
    } catch (error) {
        return toErrorResponse(error, 'Импорт не удался');
    }
}
