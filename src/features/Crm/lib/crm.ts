/**
 * Клиенты и сделки — чистые функции. Этапы и их порядок повторяют воронку
 * OKO CRM один в один (см. abhazbereg-ideas/OKO-структура-интерфейса.md):
 * менеджеры знают их наизусть, переименовывать нельзя.
 */

export type Pipeline = 'sales' | 'refund' | 'archive';

export type Stage =
    | 'zayavka'
    | 'podbor'
    | 'dumayut'
    | 'utochnit'
    | 'zhdem_oplatu'
    | 'bron'
    | 'otkaz'
    | 'zayavka_na_vozvrat'
    | 'vozvrat'
    | 'nevozvratnaya_otmena'
    | 'arhiv';

export type StageInfo = { key: Stage; label: string; color: string };

export const SALES_STAGES: StageInfo[] = [
    { key: 'zayavka', label: 'Заявка', color: '#3b82f6' },
    { key: 'podbor', label: 'Подбор', color: '#f97316' },
    { key: 'dumayut', label: 'Думают', color: '#eab308' },
    { key: 'utochnit', label: 'Уточнить детали', color: '#ef4444' },
    { key: 'zhdem_oplatu', label: 'Ждем оплату', color: '#8b5cf6' },
    { key: 'bron', label: 'Бронь', color: '#22c55e' },
    { key: 'otkaz', label: 'Отказ', color: '#9ca3af' },
];

export const REFUND_STAGES: StageInfo[] = [
    { key: 'zayavka_na_vozvrat', label: 'Заявка на возврат', color: '#3b82f6' },
    { key: 'vozvrat', label: 'Возврат', color: '#22c55e' },
    { key: 'nevozvratnaya_otmena', label: 'Невозвратная отмена', color: '#9ca3af' },
];

export const ARCHIVE_STAGES: StageInfo[] = [{ key: 'arhiv', label: 'Архив', color: '#9ca3af' }];

export const PIPELINES: { key: Pipeline; label: string; stages: StageInfo[] }[] = [
    { key: 'sales', label: 'Воронка продаж', stages: SALES_STAGES },
    { key: 'refund', label: 'Воронка возврата', stages: REFUND_STAGES },
    { key: 'archive', label: 'Архив', stages: ARCHIVE_STAGES },
];

export const STAGE_LABELS: Record<Stage, string> = Object.fromEntries(
    [...SALES_STAGES, ...REFUND_STAGES, ...ARCHIVE_STAGES].map((s) => [s.key, s.label]),
) as Record<Stage, string>;

export const DEAL_SOURCES = ['Avito', 'VK', 'WhatsApp', 'Telegram', 'Max'] as const;

/** Ответственные — как в справочнике OKO. */
export const RESPONSIBLES = [
    'Анастасия Семенова',
    'Варвара',
    'Виктория',
    'Дарья Ботова',
    'Лера',
    'Май Анастасия',
    'Настя',
    'Светлана/Вероника',
] as const;

/** Телефон к виду +7XXXXXXXXXX — так же, как oko_prepare_import.normalize_phone. */
export const normalizePhone = (raw: string): string | null => {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = '7' + digits.slice(1);
    else if (digits.length === 10) digits = '7' + digits;
    if (digits.length < 10) return null;

    return `+${digits}`;
};

/**
 * Пачка для импорта: только объекты с ключом, без повторов по ключу
 * (последняя строка побеждает), только разрешённые колонки.
 */
export const sanitizeRows = (
    rows: unknown,
    spec: { conflict: string; columns: string[] },
): Record<string, unknown>[] => {
    if (!Array.isArray(rows)) return [];
    const byKey = new Map<string, Record<string, unknown>>();
    for (const raw of rows) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const row = raw as Record<string, unknown>;
        const key = row[spec.conflict];
        if (key == null || key === '') continue;
        byKey.set(String(key), Object.fromEntries(spec.columns.filter((c) => c in row).map((c) => [c, row[c]])));
    }

    return [...byKey.values()];
};

export type DealRow = {
    id: string;
    oko_lead_id: number | null;
    client_id: string | null;
    oko_contact_id: number | null;
    reserve_id: string | null;
    title: string | null;
    pipeline: Pipeline;
    stage: Stage;
    source: string | null;
    responsible: string | null;
    hotel_full: string | null;
    hotel_title: string | null;
    check_in: string | null;
    check_out: string | null;
    people: number | null;
    price_per_night: number | null;
    nights: number | null;
    service_note: string | null;
    total: number | null;
    prepaid: number | null;
    to_pay: number | null;
    payment_bank: string | null;
    payment_date: string | null;
    comment: string | null;
    refund_amount: number | null;
    penalty: number | null;
    tags: string[];
    oko_created_at: string | null;
    oko_updated_at: string | null;
    oko_closed_at?: string | null;
    arrived_stage_at: string | null;
    oko_url: string | null;
    created_at: string;
    updated_at: string;
    updated_by: string | null;
    clients?: ClientRow | ClientRow[] | null;
};

export type ClientRow = {
    id: string;
    oko_contact_id: number | null;
    name: string | null;
    phones: string[];
    emails: string[];
    responsible: string | null;
    telegram_user_id: string | null;
    note: string | null;
    oko_created_at: string | null;
    oko_url: string | null;
    created_at?: string;
};

export type DealMessageRow = {
    id: number;
    oko_message_id: number | null;
    deal_id: string | null;
    client_id?: string | null;
    direction: 'in' | 'out';
    author_type: string | null;
    author_name: string | null;
    integration_id: number | null;
    text: string | null;
    files: string[];
    sent_at: string | null;
    /** Куда отвечать через ОКО — из последнего сообщения переписки. */
    oko_client_id?: number | null;
    oko_contact_messenger_id?: number | null;
    source?: 'import' | 'webhook' | 'outbox';
};

/**
 * Куда отправлять ответ клиенту через ОКО: берём из самого свежего сообщения,
 * где есть идентификатор переписки. У старых импортированных сообщений его нет.
 */
export const replyTargetOf = (
    messages: DealMessageRow[],
): { okoClientId: number | null; contactMessengerId: number } | null => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const messengerId = messages[i]?.oko_contact_messenger_id;
        if (messengerId) {
            return { okoClientId: messages[i].oko_client_id ?? null, contactMessengerId: messengerId };
        }
    }

    return null;
};

export const clientOf = (deal: DealRow): ClientRow | null => {
    const value = deal.clients;
    if (!value) return null;

    return Array.isArray(value) ? (value[0] ?? null) : value;
};

/** Как называется сделка в колонке: заголовок, иначе имя клиента, иначе «Сделка #id». */
export const dealTitle = (deal: DealRow): string =>
    deal.title?.trim() || clientOf(deal)?.name?.trim() || (deal.oko_lead_id ? `Сделка #${deal.oko_lead_id}` : 'Сделка');

/** Возраст сделки в днях от создания — красный бейдж «N дней», как в OKO. */
export const dealAgeDays = (deal: DealRow, nowMs: number): number => {
    const created = deal.oko_created_at ?? deal.created_at;
    if (!created) return 0;

    return Math.max(0, Math.floor((nowMs - new Date(created).getTime()) / 86400000));
};

export type StageColumn = { stage: StageInfo; deals: DealRow[]; sum: number };

/** Раскладка сделок по колонкам воронки с суммой, как в шапке OKO. */
export const groupByStage = (deals: DealRow[], pipeline: Pipeline): StageColumn[] => {
    const stages = PIPELINES.find((p) => p.key === pipeline)?.stages ?? [];
    const columns = stages.map((stage) => ({ stage, deals: [] as DealRow[], sum: 0 }));
    const byKey = new Map(columns.map((c) => [c.stage.key, c]));
    for (const deal of deals) {
        if (deal.pipeline !== pipeline) continue;
        const column = byKey.get(deal.stage);
        if (!column) continue;
        column.deals.push(deal);
        column.sum += Number(deal.total ?? 0) || 0;
    }
    for (const column of columns) {
        column.deals.sort((a, b) => {
            const ta = a.arrived_stage_at ?? a.oko_created_at ?? a.created_at;
            const tb = b.arrived_stage_at ?? b.oko_created_at ?? b.created_at;

            return (tb ? new Date(tb).getTime() : 0) - (ta ? new Date(ta).getTime() : 0);
        });
    }

    return columns;
};

export const formatMoney = (value: number | null | undefined): string =>
    value == null ? '—' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value))} ₽`;

export const formatDate = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);

    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

/** Разбор JSONL-файла из oko_prepare_import.py: строка = объект; битые строки считаются. */
export const parseJsonl = (text: string): { rows: Record<string, unknown>[]; broken: number } => {
    const rows: Record<string, unknown>[] = [];
    let broken = 0;
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === 'object' && !Array.isArray(value)) rows.push(value as Record<string, unknown>);
            else broken += 1;
        } catch {
            broken += 1;
        }
    }

    return { rows, broken };
};

/** Файл → таблица по имени: clients.jsonl, deals.jsonl, messages.jsonl. */
export const importTableForFile = (fileName: string): 'clients' | 'deals' | 'deal_messages' | null => {
    const name = fileName.toLowerCase();
    if (name.startsWith('clients')) return 'clients';
    if (name.startsWith('deals')) return 'deals';
    if (name.startsWith('messages')) return 'deal_messages';

    return null;
};

export const chunk = <T>(items: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));

    return result;
};

/** Поиск по клиентам: телефон ищем по цифрам, имя — по подстроке. */
export const clientSearchTerm = (raw: string): { phoneDigits: string | null; name: string | null } => {
    const trimmed = raw.trim();
    if (!trimmed) return { phoneDigits: null, name: null };
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 4 && digits.length >= trimmed.replace(/[\s()+-]/g, '').length) {
        // В базе номера хранятся как +7…; ввод «8 900…» ищем как «7900…».
        return { phoneDigits: digits[0] === '8' ? '7' + digits.slice(1) : digits, name: null };
    }

    return { phoneDigits: null, name: trimmed };
};
