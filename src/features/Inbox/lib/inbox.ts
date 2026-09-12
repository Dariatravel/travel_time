/**
 * «Входящие» — чистые функции. Экран закрывает ежедневную работу Алины:
 * она дважды в день вручную просматривает мессенджеры и ищет пропущенные и
 * зависшие чаты. Здесь то же самое считается само из живой переписки ОКО.
 */

export type InboxRow = {
    messenger_id: number;
    client_id: string | null;
    client_name: string | null;
    client_phones: string[] | null;
    is_temporary: boolean;
    /** Номер клиента в ОКО, если известен: нужен при отправке ответа. */
    oko_client_id: number | null;
    integration_id: number | null;
    last_text: string | null;
    last_direction: 'in' | 'out';
    last_at: string;
    /** Первое сообщение клиента без ответа; ответили — null. */
    waiting_since: string | null;
    deal_id: string | null;
    deal_stage: string | null;
};

/** Каналы ОКО по номеру подключения (сняты с рабочей CRM). */
export const CHANNELS: Record<number, string> = {
    14: 'ВКонтакте',
    30: 'Avito',
    69: 'Telegram',
    70: 'WhatsApp',
    71: 'MAX',
    72: 'MAX-бот',
};

export const channelName = (id: number | null): string =>
    id == null ? '—' : (CHANNELS[id] ?? `канал ${id}`);

export type InboxFilter = 'waiting' | 'overdue' | 'unknown' | 'all';

export const FILTER_LABELS: Record<InboxFilter, string> = {
    waiting: 'Ждут ответа',
    overdue: 'Зависшие',
    unknown: 'Без клиента',
    all: 'Все',
};

/** Сколько часов клиент ждёт ответа; ответили — null. */
export const waitingHours = (row: InboxRow, nowMs: number): number | null => {
    if (!row.waiting_since) return null;

    return Math.max(0, (nowMs - new Date(row.waiting_since).getTime()) / 3_600_000);
};

/** Зависший чат: клиент ждёт дольше часа. Так Алина и отбирает их вручную. */
export const OVERDUE_HOURS = 1;

export const isOverdue = (row: InboxRow, nowMs: number): boolean => {
    const hours = waitingHours(row, nowMs);

    return hours !== null && hours >= OVERDUE_HOURS;
};

export const filterRows = (rows: InboxRow[], filter: InboxFilter, nowMs: number): InboxRow[] => {
    switch (filter) {
        case 'waiting':
            return rows.filter((r) => r.waiting_since !== null);
        case 'overdue':
            return rows.filter((r) => isOverdue(r, nowMs));
        case 'unknown':
            return rows.filter((r) => r.is_temporary || !r.client_id);
        default:
            return rows;
    }
};

export const counts = (rows: InboxRow[], nowMs: number) => ({
    all: rows.length,
    waiting: rows.filter((r) => r.waiting_since !== null).length,
    overdue: rows.filter((r) => isOverdue(r, nowMs)).length,
    unknown: rows.filter((r) => r.is_temporary || !r.client_id).length,
});

/** «1 день», «2 дня», «5 дней» — падеж по числу. */
const plural = (n: number, one: string, few: string, many: string): string => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    const mod10 = n % 10;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;

    return many;
};

/** «2 ч 15 мин», «18 мин», «3 дня» — на глаз понятнее точного времени. */
export const humanWait = (hours: number): string => {
    if (hours >= 24) {
        const days = Math.floor(hours / 24);

        return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
    }
    if (hours >= 1) {
        const whole = Math.floor(hours);
        const minutes = Math.round((hours - whole) * 60);

        return minutes ? `${whole} ч ${minutes} мин` : `${whole} ч`;
    }

    return `${Math.max(1, Math.round(hours * 60))} мин`;
};

/**
 * Время всегда по Москве: смены менеджеров, заезды и выезды считаются по
 * московским суткам, и часовой пояс компьютера не должен на это влиять.
 */
const MOSCOW = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

export const formatMoment = (iso: string): string => {
    const parts = MOSCOW.formatToParts(new Date(iso));
    const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

    return `${at('day')}.${at('month')} ${at('hour')}:${at('minute')}`;
};
