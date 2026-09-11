import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isTransientRequestError, requestError, withRequestRetry } from './retryRequest.mjs';

test('временные ответы распознаются', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
        assert.ok(isTransientRequestError(requestError('сбой', status)), `статус ${status}`);
    }
});

test('постоянные ответы не считаются временными', () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
        assert.equal(isTransientRequestError(requestError('сбой', status)), false, `статус ${status}`);
    }
});

test('сетевые сбои считаются временными', () => {
    assert.ok(isTransientRequestError(new Error('fetch failed')));
    assert.ok(isTransientRequestError(new Error('The operation was aborted due to timeout')));
    assert.ok(isTransientRequestError(new Error('ECONNRESET')));
});

test('временный сбой повторяется и операция доходит до успеха', async () => {
    let calls = 0;
    const result = await withRequestRetry(
        async () => {
            calls += 1;
            if (calls < 3) throw requestError('FrontDesk24: 503', 503);
            return 'занятость получена';
        },
        { retries: 2, baseDelayMs: 1 },
    );

    assert.equal(result, 'занятость получена');
    assert.equal(calls, 3);
});

test('постоянный сбой не повторяется', async () => {
    let calls = 0;
    await assert.rejects(
        withRequestRetry(
            async () => {
                calls += 1;
                throw requestError('iCal: 404', 404);
            },
            { retries: 2, baseDelayMs: 1 },
        ),
        /404/,
    );

    assert.equal(calls, 1, 'удалённый календарь повторять незачем');
});

test('после исчерпания попыток ошибка отдаётся наружу', async () => {
    let calls = 0;
    await assert.rejects(
        withRequestRetry(
            async () => {
                calls += 1;
                throw requestError('FrontDesk24: 502', 502);
            },
            { retries: 2, baseDelayMs: 1 },
        ),
        /502/,
    );

    assert.equal(calls, 3, 'первая попытка плюс два повтора');
});

test('одна осечка из многих запросов больше не рушит весь отель', async () => {
    // Модель «Норы»: 300 ночей, одна ночь падает один раз. Без повтора
    // источник считался неполным и занятость не обновлялась вовсе.
    const failedOnce = new Set();
    let completed = 0;

    for (let night = 0; night < 300; night += 1) {
        await withRequestRetry(
            async () => {
                if (night === 137 && !failedOnce.has(night)) {
                    failedOnce.add(night);
                    throw requestError('FrontDesk24: 503', 503);
                }
                completed += 1;
            },
            { retries: 2, baseDelayMs: 1 },
        );
    }

    assert.equal(completed, 300, 'все ночи должны быть прочитаны');
});
