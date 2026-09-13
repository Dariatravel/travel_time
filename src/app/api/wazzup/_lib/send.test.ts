import { describe, expect, it } from 'vitest';

import { buildSendBody, classifySendResult, describeWazzupError, wazzupErrorCode, type ChatForSend } from './send';

const directChat: ChatForSend = { kind: 'direct', chat_type: 'instagram', chat_id: 'anna.travel', channel_external_id: 'ch-1' };
const commentChat: ChatForSend = { ...directChat, kind: 'comment' };
const OUT = '22222222-2222-2222-2222-222222222222';

describe('тело отправки', () => {
    it('Direct: без цитаты, crmMessageId = строка очереди', () => {
        expect(buildSendBody(directChat, 'direct', 'Здравствуйте', null, OUT)).toEqual({
            ok: true,
            body: { channelId: 'ch-1', chatType: 'instagram', chatId: 'anna.travel', text: 'Здравствуйте', crmMessageId: OUT },
        });
    });

    it('под постом — с цитатой комментария', () => {
        const r = buildSendBody(commentChat, 'comment_public', 'Написали вам', 'c-1', OUT);
        expect(r.ok && r.body.refMessageId).toBe('c-1');
    });

    it('в Direct автору комментария — без цитаты', () => {
        const r = buildSendBody(commentChat, 'comment_private', 'Цены в личке', 'c-1', OUT);
        expect(r.ok).toBe(true);
        expect(r.ok && 'refMessageId' in r.body).toBe(false);
    });

    it('неподходящий способ или нет комментария — отказ', () => {
        expect(buildSendBody(directChat, 'comment_public', 'x', 'c-1', OUT).ok).toBe(false);
        expect(buildSendBody(commentChat, 'direct', 'x', null, OUT).ok).toBe(false);
        expect(buildSendBody(commentChat, 'comment_private', 'x', null, OUT)).toEqual({
            ok: false,
            error: 'Не найден комментарий, на который отвечаем',
        });
        expect(buildSendBody(directChat, 'bogus' as never, 'x', null, OUT).ok).toBe(false);
    });
});

describe('разбор ответа Wazzup', () => {
    it('201 — отправлено, с номером сообщения', () => {
        expect(
            classifySendResult({ kind: 'http', status: 201, ok: true, body: { messageId: 'm-1', chatId: 'anna.travel' } }),
        ).toEqual({ status: 'sent', externalMessageId: 'm-1', error: null });
    });

    it('обрыв или таймаут — «неизвестно», не «не ушло»', () => {
        const r = classifySendResult({ kind: 'network', timeout: true, message: 'нет ответа за 15 секунд' });
        expect(r.status).toBe('unknown');
        expect(r.error).toContain('могло уйти');
    });

    it('5xx — «неизвестно»', () => {
        expect(classifySendResult({ kind: 'http', status: 502, ok: false, body: 'Bad gateway' }).status).toBe('unknown');
    });

    it('понятные отказы — «не ушло» с причиной по-русски', () => {
        expect(
            classifySendResult({ kind: 'http', status: 400, ok: false, body: { error: 'CHANNEL_NOT_FOUND' } }),
        ).toEqual({ status: 'failed', externalMessageId: null, error: 'Канал не найден в Wazzup — нажмите «Обновить каналы»' });
        expect(
            classifySendResult({ kind: 'http', status: 400, ok: false, body: [{ error: 'MESSAGE_TEXT_TOO_LONG' }] }).error,
        ).toBe('Текст слишком длинный для этого канала');
        expect(classifySendResult({ kind: 'http', status: 401, ok: false, body: null }).error).toContain('ключ API');
    });

    it('неизвестная ошибка — код и описание Wazzup', () => {
        expect(describeWazzupError(400, { error: 'SOMETHING_NEW', description: 'Новое' })).toBe(
            'Wazzup ответил 400: SOMETHING_NEW: Новое',
        );
        expect(wazzupErrorCode('text with MESSAGES_IS_SPAM inside')).toBe('MESSAGES_IS_SPAM');
        expect(wazzupErrorCode(null)).toBeNull();
    });
});
