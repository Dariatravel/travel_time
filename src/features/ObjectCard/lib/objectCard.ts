/**
 * Карточка объекта — чистые функции и справочники.
 *
 * Карточка = отель в шахматке + описание для гостей + внутреннее + где
 * размещён. Публичную часть отельер может предложить изменить: правка
 * ложится «на проверку» (draft), менеджер подтверждает. Список публичных
 * полей здесь и в базе (hotel_card_public_keys) должен совпадать.
 */

export type Tariff = 'basic' | 'partner' | 'exclusive';

export const TARIFF_LABELS: Record<Tariff, string> = {
    basic: 'Базовый',
    partner: 'Партнёр',
    exclusive: 'Эксклюзив',
};

export type Channel = 'site' | 'telegram' | 'avito' | 'max' | 'vk' | 'dzen' | 'yandex_map' | 'gis2' | 'google_map';

export const CHANNELS: { key: Channel; label: string }[] = [
    { key: 'site', label: 'Сайт' },
    { key: 'telegram', label: 'Telegram' },
    { key: 'avito', label: 'Авито' },
    { key: 'max', label: 'MAX' },
    { key: 'vk', label: 'ВКонтакте' },
    { key: 'dzen', label: 'Дзен' },
    { key: 'yandex_map', label: 'Яндекс-точка' },
    { key: 'gis2', label: '2ГИС' },
    { key: 'google_map', label: 'Google-точка' },
];

export type PlacementStatus = 'posted' | 'outdated' | 'missing';

export const PLACEMENT_LABELS: Record<PlacementStatus, string> = {
    posted: 'размещён',
    outdated: 'устарел',
    missing: 'нет',
};

export type CardPublic = {
    summary: string | null;
    description: string | null;
    capacity_text: string | null;
    beach_text: string | null;
    checkin: string | null;
    checkout: string | null;
    min_nights: number | null;
    kids: string | null;
    pets: string | null;
    food: string | null;
    kitchen: string | null;
    nearby: string | null;
    rules: string | null;
    amenities: string[];
};

export type PublicKey = keyof CardPublic;

export type FieldKind = 'text' | 'textarea' | 'number' | 'tags';

/** Порядок и подписи публичных полей — общие для менеджера и отельера. */
export const PUBLIC_FIELDS: { key: PublicKey; label: string; kind: FieldKind; hint?: string }[] = [
    { key: 'summary', label: 'Коротко об объекте', kind: 'text', hint: 'Одна фраза для списка и постов' },
    { key: 'description', label: 'Описание для гостей', kind: 'textarea' },
    { key: 'capacity_text', label: 'Размещение', kind: 'text', hint: 'Например: 2 / 3 / 4 человека' },
    { key: 'beach_text', label: 'Пляж и расстояние', kind: 'text' },
    { key: 'checkin', label: 'Заезд с', kind: 'text' },
    { key: 'checkout', label: 'Выезд до', kind: 'text' },
    { key: 'min_nights', label: 'Минимум ночей', kind: 'number' },
    { key: 'kids', label: 'Дети', kind: 'text' },
    { key: 'pets', label: 'Животные', kind: 'text' },
    { key: 'food', label: 'Питание', kind: 'text' },
    { key: 'kitchen', label: 'Кухня, мангал', kind: 'text' },
    { key: 'nearby', label: 'Что рядом', kind: 'textarea' },
    { key: 'rules', label: 'Правила и условия', kind: 'textarea' },
    { key: 'amenities', label: 'Удобства', kind: 'tags', hint: 'Через запятую' },
];

export const PUBLIC_KEYS: PublicKey[] = PUBLIC_FIELDS.map((f) => f.key);

export type CardInternal = {
    tariff: Tariff;
    owner_contact: string | null;
    prepay_terms: string | null;
    internal_note: string | null;
    checked_at: string | null;
};

export type CardRow = CardPublic &
    CardInternal & {
        hotel_id: string;
        draft: Partial<CardPublic> | null;
        draft_at: string | null;
        updated_at: string | null;
        updated_by: string | null;
    };

export type HotelierCardRow = CardPublic & {
    hotel_id: string;
    title: string | null;
    city: string | null;
    address: string | null;
    phone: string | null;
    draft: Partial<CardPublic> | null;
    draft_at: string | null;
};

export type PlacementRow = {
    hotel_id: string;
    channel: Channel;
    status: PlacementStatus;
    url: string | null;
};

export const emptyPublic = (): CardPublic => ({
    summary: null,
    description: null,
    capacity_text: null,
    beach_text: null,
    checkin: null,
    checkout: null,
    min_nights: null,
    kids: null,
    pets: null,
    food: null,
    kitchen: null,
    nearby: null,
    rules: null,
    amenities: [],
});

export const emptyCard = (hotelId: string): CardRow => ({
    ...emptyPublic(),
    hotel_id: hotelId,
    tariff: 'basic',
    owner_contact: null,
    prepay_terms: null,
    internal_note: null,
    checked_at: null,
    draft: null,
    draft_at: null,
    updated_at: null,
    updated_by: null,
});

const MAX_TEXT = 4000;
const MAX_TAGS = 30;
const MAX_TAG = 60;

/** Удобства из строки «через запятую» — без пустых и повторов. */
export const parseTags = (value: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of value.split(/[,;\n]/)) {
        const tag = raw.trim().slice(0, MAX_TAG);
        if (!tag || seen.has(tag.toLowerCase())) continue;
        seen.add(tag.toLowerCase());
        result.push(tag);
        if (result.length >= MAX_TAGS) break;
    }

    return result;
};

/**
 * Привести введённое к виду, который принимает база: только публичные
 * поля, пустая строка → null, тексты обрезаны, min_nights — целое 1..60.
 * То же делает hotelier_submit_card; здесь — чтобы отельер увидел
 * результат до отправки.
 */
export const cleanPublic = (input: Partial<Record<PublicKey, unknown>>): Partial<CardPublic> => {
    const out: Partial<CardPublic> = {};
    for (const field of PUBLIC_FIELDS) {
        if (!(field.key in input)) continue;
        const value = input[field.key];
        if (field.key === 'amenities') {
            const tags = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? parseTags(value) : [];
            out.amenities = parseTags(tags.join(','));
        } else if (field.key === 'min_nights') {
            const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
            out.min_nights = n !== null && Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
        } else {
            const text = typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
            out[field.key] = text || null;
        }
    }

    return out;
};

export type Change = { key: PublicKey; label: string; before: string; after: string };

const show = (key: PublicKey, value: unknown): string => {
    if (key === 'amenities') return Array.isArray(value) && value.length ? value.join(', ') : '—';
    if (value === null || value === undefined || value === '') return '—';

    return String(value);
};

/** Что отельер предлагает изменить: только поля, где значение другое. */
export const draftChanges = (current: CardPublic, draft: Partial<CardPublic> | null): Change[] => {
    if (!draft) return [];
    const changes: Change[] = [];
    for (const field of PUBLIC_FIELDS) {
        if (!(field.key in draft)) continue;
        const before = show(field.key, current[field.key]);
        const after = show(field.key, draft[field.key]);
        if (before !== after) changes.push({ key: field.key, label: field.label, before, after });
    }

    return changes;
};

/** Только те поля правки, что отличаются от карточки, — их и отправляем. */
export const changedOnly = (current: CardPublic, draft: Partial<CardPublic>): Partial<CardPublic> => {
    const out: Partial<CardPublic> = {};
    for (const change of draftChanges(current, draft)) {
        (out as Record<string, unknown>)[change.key] = draft[change.key];
    }

    return out;
};

/** Правка поверх карточки — так отельер видит свои неподтверждённые поля. */
export const withDraft = (current: CardPublic, draft: Partial<CardPublic> | null): CardPublic =>
    draft ? { ...current, ...draft } : current;

/** Доля заполненных публичных полей, 0..1 — для списка объектов. */
export const completeness = (card: CardPublic): number => {
    const filled = PUBLIC_FIELDS.filter((f) => {
        const v = card[f.key];

        return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '';
    }).length;

    return filled / PUBLIC_FIELDS.length;
};

/** Внутренние поля тоже проходят через один фильтр, чтобы не слать мусор. */
export const cleanInternal = (input: Partial<CardInternal>): CardInternal => ({
    tariff: input.tariff === 'partner' || input.tariff === 'exclusive' ? input.tariff : 'basic',
    owner_contact: (input.owner_contact ?? '').trim().slice(0, 300) || null,
    prepay_terms: (input.prepay_terms ?? '').trim().slice(0, 1000) || null,
    internal_note: (input.internal_note ?? '').trim().slice(0, MAX_TEXT) || null,
    checked_at: input.checked_at && /^\d{4}-\d{2}-\d{2}$/.test(input.checked_at) ? input.checked_at : null,
});
