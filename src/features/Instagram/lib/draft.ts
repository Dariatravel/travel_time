import { normalizeOutgoingText, type SendMode } from './instagram';

/**
 * Ключ черновика ответа — чистая логика экрана, проверяется тестами (draft.test.ts).
 *
 * Ключ уходит на сервер и становится id строки очереди и crmMessageId в Wazzup.
 * Сервер записывает строку ДО обращения к Wazzup, а на повтор с тем же ключом
 * возвращает её статус и второй раз не отправляет. Поэтому повтор с ТЕМ ЖЕ
 * ключом всегда безопасен, а новый ключ — это новое сообщение клиенту:
 *  - нет ответа от нашего сервера (сеть, 504) — кнопка «Проверить»: тот же ключ;
 *  - новый ключ («Отправить ещё раз») — только после ответа сервера unknown
 *    или failed по этому ключу и с предупреждением «могло уже уйти клиенту»;
 *  - правка, после которой текст не изменился (normalizeOutgoingText), ключ
 *    не сбрасывает; реальная правка текста или смена адресата — новый черновик.
 */

export type DraftPayload = { text: string; mode: SendMode; refExternalId: string | null };

export type DraftPhase = 'idle' | 'sending' | 'no_response' | 'pending' | 'unknown' | 'failed';

export type DraftState = {
    key: string | null;
    /** Что отправлялось с этим ключом — для «Проверить» и «Отправить ещё раз». */
    payload: DraftPayload | null;
    phase: DraftPhase;
    /** Прошлое сообщение могло уйти — предупреждать и в новом черновике. */
    mayHaveSent: boolean;
    error: string | null;
};

export const INITIAL_DRAFT: DraftState = { key: null, payload: null, phase: 'idle', mayHaveSent: false, error: null };

export type SendOutcome =
    /** Сервер ответил статусом строки очереди. */
    | { kind: 'response'; status: 'sent' | 'failed' | 'unknown' | 'pending'; error?: string | null }
    /** Понятный отказ нашего сервера (4xx): строка очереди не создавалась. */
    | { kind: 'rejected'; error: string }
    /** Ответа нет или он непонятен (сеть, 5xx): что с сообщением — неизвестно. */
    | { kind: 'no_response'; error?: string | null };

export type DraftAction =
    | { type: 'edit'; payload: DraftPayload }
    | { type: 'send'; payload: DraftPayload; freshKey: string }
    | { type: 'check' }
    | { type: 'resend'; freshKey: string }
    | { type: 'result'; key: string; outcome: SendOutcome }
    | { type: 'reset' };

/** Что считается «тем же сообщением»: способ ответа, адресат и текст после нормализации. */
export const draftSignature = (payload: DraftPayload): string =>
    JSON.stringify([
        payload.mode,
        payload.mode === 'direct' ? null : payload.refExternalId,
        normalizeOutgoingText(payload.text),
    ]);

const sameDraft = (a: DraftPayload | null, b: DraftPayload): boolean => !!a && draftSignature(a) === draftSignature(b);

/** После этих состояний сообщение по старому ключу могло уйти. */
const MAY_HAVE_SENT = new Set<DraftPhase>(['no_response', 'pending', 'unknown']);

export const draftReducer = (state: DraftState, action: DraftAction): DraftState => {
    switch (action.type) {
        case 'edit': {
            // Во время отправки поле ввода закрыто; на всякий случай ничего не меняем.
            if (state.phase === 'sending') return state;
            if (!state.key) return state.error ? { ...state, error: null } : state;
            if (sameDraft(state.payload, action.payload)) return state;

            return { ...INITIAL_DRAFT, mayHaveSent: state.mayHaveSent || MAY_HAVE_SENT.has(state.phase) };
        }
        case 'send':
            if (state.phase !== 'idle') return state;

            return { ...state, key: action.freshKey, payload: action.payload, phase: 'sending', error: null };
        case 'check':
            if (!state.key || !state.payload || (state.phase !== 'no_response' && state.phase !== 'pending')) {
                return state;
            }

            return { ...state, phase: 'sending', error: null };
        case 'resend':
            if (!state.payload || (state.phase !== 'unknown' && state.phase !== 'failed')) return state;

            return { ...state, key: action.freshKey, phase: 'sending', mayHaveSent: true, error: null };
        case 'result': {
            // Ответ по старому ключу (панель успела перейти дальше) не трогаем.
            if (action.key !== state.key || state.phase !== 'sending') return state;
            const outcome = action.outcome;
            if (outcome.kind === 'rejected') return { ...INITIAL_DRAFT, mayHaveSent: state.mayHaveSent, error: outcome.error };
            if (outcome.kind === 'no_response') return { ...state, phase: 'no_response', error: outcome.error ?? null };
            if (outcome.status === 'sent') return INITIAL_DRAFT;

            return { ...state, phase: outcome.status, error: outcome.error ?? null };
        }
        case 'reset':
            return INITIAL_DRAFT;
        default:
            return state;
    }
};

/** Ошибка запроса → исход: 4xx — понятный отказ, всё прочее — «ответа нет». */
export const outcomeFromError = (status: number | null, message: string): SendOutcome =>
    status !== null && status >= 400 && status < 500
        ? { kind: 'rejected', error: message }
        : { kind: 'no_response', error: message };

export const MAY_HAVE_SENT_WARNING =
    'Сообщение могло уже уйти клиенту — проверьте в Instagram, прежде чем отправлять ещё раз.';

export type DraftView = {
    /** send — «Отправить», check — «Проверить» (тот же ключ), busy — ждём, none — только «Отправить ещё раз». */
    primary: 'send' | 'check' | 'busy' | 'none';
    primaryLabel: string;
    canResend: boolean;
    warning: string | null;
};

export const draftView = (state: DraftState): DraftView => {
    switch (state.phase) {
        case 'sending':
            return { primary: 'busy', primaryLabel: 'Отправляю…', canResend: false, warning: null };
        case 'no_response':
            return {
                primary: 'check',
                primaryLabel: 'Проверить',
                canResend: false,
                warning: `Не получили ответ сервера${state.error ? ` (${state.error})` : ''}. «Проверить» повторит запрос с тем же ключом — второй раз сообщение не уйдёт.`,
            };
        case 'pending':
            return {
                primary: 'check',
                primaryLabel: 'Проверить',
                canResend: false,
                warning: 'Сообщение ещё отправляется — подождите и нажмите «Проверить».',
            };
        case 'unknown':
            return { primary: 'none', primaryLabel: 'Отправить', canResend: true, warning: MAY_HAVE_SENT_WARNING };
        case 'failed':
            return {
                primary: 'none',
                primaryLabel: 'Отправить',
                canResend: true,
                warning: `Не ушло${state.error ? `: ${state.error}` : ''}. ${MAY_HAVE_SENT_WARNING}`,
            };
        default:
            return {
                primary: 'send',
                primaryLabel: 'Отправить',
                canResend: false,
                warning: state.mayHaveSent
                    ? 'Предыдущее сообщение могло уйти клиенту — проверьте в Instagram.'
                    : state.error,
            };
    }
};
