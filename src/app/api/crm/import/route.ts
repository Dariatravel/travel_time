import { requireStaff } from '@/app/api/survey/_lib/requireStaff';
import { toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { sanitizeRows } from '@/features/Crm/lib/crm';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Импорт из OKO пачками: страница «Импорт» читает подготовленные файлы
 * (clients/deals/messages.jsonl) в браузере и шлёт сюда по 500 строк.
 *
 * Правила:
 *  - строки пишутся upsert-ом по идентификатору OKO — повторный импорт без дублей;
 *  - внутри пачки повторы по ключу схлопываются (иначе Postgres откажет);
 *  - сделки, которые уже правили в шахматке (updated_by заполнен), импорт
 *    НЕ трогает — иначе повторная загрузка откатила бы работу менеджеров;
 *  - связка делается тут же по пачке: клиент по oko_contact_id, сделка по
 *    oko_lead_id (один UPDATE на всю базу не уложился бы в 30 секунд);
 *  - created_at копируется из OKO, чтобы «последние» сортировались честно.
 */

const MAX_ROWS = 500;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

type Table = 'clients' | 'deals' | 'deal_messages';
type Row = Record<string, unknown>;

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
        columns: ['oko_message_id', 'oko_contact_id', 'oko_lead_id', 'direction', 'author_type', 'author_name', 'integration_id', 'text', 'files', 'sent_at'],
    },
};

const numbers = (rows: Row[], field: string): number[] =>
    [...new Set(rows.map((r) => r[field]).filter((v): v is number => typeof v === 'number'))];

export async function POST(request: NextRequest) {
    const auth = await requireStaff(request);
    if ('error' in auth) return auth.error;

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) {
        return NextResponse.json({ error: 'Пачка больше 3 МБ — уменьшите размер пачки' }, { status: 413 });
    }

    try {
        const body = (await request.json()) as { table?: string; rows?: unknown };
        const table = body.table as Table;
        if (!(table in TABLES)) return NextResponse.json({ error: 'Неизвестная таблица' }, { status: 400 });
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
            return NextResponse.json({ error: 'Нет строк' }, { status: 400 });
        }
        if (body.rows.length > MAX_ROWS) {
            return NextResponse.json({ error: `Не больше ${MAX_ROWS} строк за раз` }, { status: 413 });
        }

        const service = createSupabaseServiceRoleClient();
        const spec = TABLES[table];
        let rows = sanitizeRows(body.rows, spec);
        if (rows.length === 0) return NextResponse.json({ ok: true, written: 0, skipped: body.rows.length });
        let skipped = body.rows.length - rows.length;

        if (table === 'clients') {
            rows = rows.map((r) => ({ ...r, created_at: r.oko_created_at ?? undefined }));
        }

        if (table === 'deals') {
            // Не затирать сделки, которые уже правили в шахматке.
            const ids = numbers(rows, 'oko_lead_id');
            const { data: edited, error: editedError } = await service
                .from('deals')
                .select('oko_lead_id')
                .in('oko_lead_id', ids)
                .not('updated_by', 'is', null);
            if (editedError) throw new Error(`deals: ${editedError.message}`);
            const protectedIds = new Set((edited ?? []).map((r) => (r as { oko_lead_id: number }).oko_lead_id));
            rows = rows.filter((r) => !protectedIds.has(r.oko_lead_id as number));
            skipped += protectedIds.size;

            // Связка с клиентом по oko_contact_id — внутри пачки.
            const contactIds = numbers(rows, 'oko_contact_id');
            const clientByContact = new Map<number, string>();
            if (contactIds.length > 0) {
                const { data: clients, error: clientsError } = await service
                    .from('clients')
                    .select('id, oko_contact_id')
                    .in('oko_contact_id', contactIds);
                if (clientsError) throw new Error(`clients: ${clientsError.message}`);
                for (const c of (clients ?? []) as { id: string; oko_contact_id: number }[]) {
                    clientByContact.set(c.oko_contact_id, c.id);
                }
            }
            rows = rows.map((r) => ({
                ...r,
                client_id: clientByContact.get(r.oko_contact_id as number) ?? null,
                created_at: r.oko_created_at ?? undefined,
            }));
        }

        if (table === 'deal_messages') {
            const contactIds = numbers(rows, 'oko_contact_id');
            const leadIds = numbers(rows, 'oko_lead_id');
            const [clientsResult, dealsResult] = await Promise.all([
                contactIds.length > 0
                    ? service.from('clients').select('id, oko_contact_id').in('oko_contact_id', contactIds)
                    : Promise.resolve({ data: [], error: null }),
                leadIds.length > 0
                    ? service.from('deals').select('id, oko_lead_id').in('oko_lead_id', leadIds)
                    : Promise.resolve({ data: [], error: null }),
            ]);
            if (clientsResult.error) throw new Error(`clients: ${clientsResult.error.message}`);
            if (dealsResult.error) throw new Error(`deals: ${dealsResult.error.message}`);
            const clientByContact = new Map(
                ((clientsResult.data ?? []) as { id: string; oko_contact_id: number }[]).map((c) => [c.oko_contact_id, c.id]),
            );
            const dealByLead = new Map(
                ((dealsResult.data ?? []) as { id: string; oko_lead_id: number }[]).map((d) => [d.oko_lead_id, d.id]),
            );
            rows = rows.map((r) => ({
                ...r,
                client_id: clientByContact.get(r.oko_contact_id as number) ?? null,
                deal_id: dealByLead.get(r.oko_lead_id as number) ?? null,
            }));
        }

        if (rows.length > 0) {
            const { error } = await service.from(table).upsert(rows, { onConflict: spec.conflict });
            if (error) throw new Error(`${table}: ${error.message}`);
        }

        return NextResponse.json({ ok: true, written: rows.length, skipped });
    } catch (error) {
        return toErrorResponse(error, 'Импорт не удался');
    }
}
