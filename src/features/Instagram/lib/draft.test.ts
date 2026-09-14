import { describe, expect, it } from 'vitest';

import {
    draftReducer,
    draftView,
    INITIAL_DRAFT,
    outcomeFromError,
    type DraftAction,
    type DraftPayload,
    type DraftState,
} from './draft';

const payload = (text: string, extra: Partial<DraftPayload> = {}): DraftPayload => ({
    text,
    mode: 'direct',
    refExternalId: null,
    ...extra,
});

const run = (actions: DraftAction[], state: DraftState = INITIAL_DRAFT): DraftState => actions.reduce(draftReducer, state);

const sentAndLost = (): DraftState =>
    run([
        { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
        { type: 'result', key: 'k1', outcome: { kind: 'no_response', error: 'Failed to fetch' } },
    ]);

describe('ключ черновика: обрыв связи', () => {
    it('нет ответа сервера → «Проверить» с тем же ключом, нового ключа не выдаём', () => {
        const lost = sentAndLost();
        expect(lost).toMatchObject({ key: 'k1', phase: 'no_response' });
        expect(draftView(lost)).toMatchObject({ primary: 'check', primaryLabel: 'Проверить', canResend: false });

        // «Отправить ещё раз» и обычная отправка здесь недоступны.
        expect(draftReducer(lost, { type: 'resend', freshKey: 'k2' })).toBe(lost);
        expect(draftReducer(lost, { type: 'send', payload: payload('Привет'), freshKey: 'k2' })).toBe(lost);

        const checking = draftReducer(lost, { type: 'check' });
        expect(checking).toMatchObject({ key: 'k1', phase: 'sending', payload: { text: 'Привет' } });
    });

    it('проверка снова без ответа → опять «Проверить» с тем же ключом', () => {
        const again = run(
            [{ type: 'check' }, { type: 'result', key: 'k1', outcome: { kind: 'no_response' } }],
            sentAndLost(),
        );
        expect(again).toMatchObject({ key: 'k1', phase: 'no_response' });
    });

    it('проверка показала «отправлено» → чистый черновик', () => {
        const done = run(
            [{ type: 'check' }, { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'sent' } }],
            sentAndLost(),
        );
        expect(done).toEqual(INITIAL_DRAFT);
    });

    it('«ещё отправляется» (pending) → тоже «Проверить», тот же ключ', () => {
        const pending = run(
            [{ type: 'check' }, { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'pending' } }],
            sentAndLost(),
        );
        expect(pending).toMatchObject({ key: 'k1', phase: 'pending' });
        expect(draftView(pending).primary).toBe('check');
        expect(draftReducer(pending, { type: 'resend', freshKey: 'k2' })).toBe(pending);
    });
});

describe('ключ черновика: ответ сервера unknown или failed', () => {
    it('unknown → разрешён новый ключ, с предупреждением «могло уже уйти клиенту»', () => {
        const unknown = run([
            { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'unknown', error: 'обрыв' } },
        ]);
        const view = draftView(unknown);
        expect(view).toMatchObject({ primary: 'none', canResend: true });
        expect(view.warning).toContain('могло уже уйти клиенту');

        const resent = draftReducer(unknown, { type: 'resend', freshKey: 'k2' });
        expect(resent).toMatchObject({ key: 'k2', phase: 'sending', mayHaveSent: true, payload: { text: 'Привет' } });
    });

    it('failed → тоже новый ключ и то же предупреждение', () => {
        const failed = run([
            { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'failed', error: 'Канал недоступен' } },
        ]);
        const view = draftView(failed);
        expect(view.canResend).toBe(true);
        expect(view.warning).toContain('Канал недоступен');
        expect(view.warning).toContain('могло уже уйти клиенту');
        expect(draftReducer(failed, { type: 'resend', freshKey: 'k2' }).key).toBe('k2');
    });
});

describe('ключ черновика: правка текста', () => {
    it('правка пробелов и переносов → ключ тот же, состояние не меняется', () => {
        const lost = sentAndLost();
        expect(draftReducer(lost, { type: 'edit', payload: payload('  Привет \r\n') })).toBe(lost);
        expect(draftReducer(lost, { type: 'edit', payload: payload('Привет\n') })).toBe(lost);
    });

    it('нет ответа сервера → правка текста НЕ открывает новую отправку, сначала «Проверить»', () => {
        const lost = sentAndLost();
        const edited = draftReducer(lost, { type: 'edit', payload: payload('Привет!') });
        expect(edited).toBe(lost);
        expect(draftView(edited)).toMatchObject({ primary: 'check', canResend: false });
        // Обычная отправка исправленного текста с новым ключом недоступна.
        expect(draftReducer(edited, { type: 'send', payload: payload('Привет!'), freshKey: 'k3' })).toBe(lost);
    });

    it('«ещё отправляется» → правка текста тоже не открывает новую отправку', () => {
        const pending = run(
            [{ type: 'check' }, { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'pending' } }],
            sentAndLost(),
        );
        expect(draftReducer(pending, { type: 'edit', payload: payload('Совсем другое') })).toBe(pending);
    });

    it('после ответа unknown реальная правка → новый черновик, предупреждение о прошлом остаётся', () => {
        const unknown = run([
            { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'unknown' } },
        ]);
        const edited = draftReducer(unknown, { type: 'edit', payload: payload('Привет!') });
        expect(edited).toMatchObject({ key: null, phase: 'idle', mayHaveSent: true });
        expect(draftView(edited)).toMatchObject({ primary: 'send' });
        expect(draftView(edited).warning).toContain('могло уйти');

        const next = draftReducer(edited, { type: 'send', payload: payload('Привет!'), freshKey: 'k3' });
        expect(next).toMatchObject({ key: 'k3', phase: 'sending' });
    });

    it('смена способа ответа или комментария — тоже новый черновик', () => {
        const base = run([
            { type: 'send', payload: payload('Цены', { mode: 'comment_public', refExternalId: 'c1' }), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'unknown' } },
        ]);
        const sameMode = draftReducer(base, {
            type: 'edit',
            payload: payload(' Цены ', { mode: 'comment_public', refExternalId: 'c1' }),
        });
        expect(sameMode).toBe(base);
        expect(
            draftReducer(base, { type: 'edit', payload: payload('Цены', { mode: 'comment_private', refExternalId: 'c1' }) }).key,
        ).toBeNull();
        expect(
            draftReducer(base, { type: 'edit', payload: payload('Цены', { mode: 'comment_public', refExternalId: 'c2' }) }).key,
        ).toBeNull();
    });

    it('правка во время отправки ключ не сбрасывает', () => {
        const sending = draftReducer(INITIAL_DRAFT, { type: 'send', payload: payload('Привет'), freshKey: 'k1' });
        expect(draftReducer(sending, { type: 'edit', payload: payload('Другое') })).toBe(sending);
    });
});

describe('ключ черновика: прочее', () => {
    it('ответ по старому ключу не трогает новый черновик', () => {
        const resent = run([
            { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'unknown' } },
            { type: 'resend', freshKey: 'k2' },
        ]);
        expect(draftReducer(resent, { type: 'result', key: 'k1', outcome: { kind: 'response', status: 'sent' } })).toBe(
            resent,
        );
    });

    it('понятный отказ сервера (4xx) → ничего не ушло, новый черновик с причиной', () => {
        expect(outcomeFromError(409, 'уже писали')).toEqual({ kind: 'rejected', error: 'уже писали' });
        expect(outcomeFromError(400, 'пусто')).toMatchObject({ kind: 'rejected' });
        expect(outcomeFromError(504, 'шлюз')).toEqual({ kind: 'no_response', error: 'шлюз' });
        expect(outcomeFromError(502, 'база')).toMatchObject({ kind: 'no_response' });
        expect(outcomeFromError(null, 'Failed to fetch')).toMatchObject({ kind: 'no_response' });

        const rejected = run([
            { type: 'send', payload: payload('Привет'), freshKey: 'k1' },
            { type: 'result', key: 'k1', outcome: outcomeFromError(409, 'уже писали') },
        ]);
        expect(rejected).toMatchObject({ key: null, phase: 'idle', error: 'уже писали' });
        expect(draftView(rejected)).toMatchObject({ primary: 'send', warning: 'уже писали' });
    });

    it('отказ сервера (401) на «Проверить» → ключ и «Проверить» остаются, причина видна', () => {
        const checkedAfterLogout = run(
            [{ type: 'check' }, { type: 'result', key: 'k1', outcome: outcomeFromError(401, 'Не авторизован') }],
            sentAndLost(),
        );
        expect(checkedAfterLogout).toMatchObject({ key: 'k1', phase: 'no_response', error: 'Не авторизован' });
        const view = draftView(checkedAfterLogout);
        expect(view).toMatchObject({ primary: 'check', canResend: false });
        expect(view.warning).toContain('Не авторизован');
        // После входа — снова проверка тем же ключом, а не новая отправка.
        expect(draftReducer(checkedAfterLogout, { type: 'send', payload: payload('Привет'), freshKey: 'k2' })).toBe(
            checkedAfterLogout,
        );
        expect(draftReducer(checkedAfterLogout, { type: 'check' })).toMatchObject({ key: 'k1', phase: 'sending' });
    });

    it('первая отправка — свежий ключ; повторное нажатие во время отправки ничего не делает', () => {
        const sending = draftReducer(INITIAL_DRAFT, { type: 'send', payload: payload('Привет'), freshKey: 'k1' });
        expect(sending.key).toBe('k1');
        expect(draftReducer(sending, { type: 'send', payload: payload('Привет'), freshKey: 'k9' })).toBe(sending);
        expect(draftView(sending).primary).toBe('busy');
    });
});
