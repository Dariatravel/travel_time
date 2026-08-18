import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateToUnix, planBookingPeriod } from './bnovoPeriod.mjs';

const TODAY = '2026-08-18';
const todayUnix = Date.UTC(2026, 7, 18) / 1000;

test('гость выезжает сегодня — не переносим, а не пишем битый период', () => {
    // Ровно этот случай ронял крон каждый час: заезд подтягивался к сегодняшним
    // 14:00, выезд оставался сегодня в 12:00, и база отвечала
    // «Некорректный период: конец раньше начала».
    assert.equal(planBookingPeriod('2026-08-15', TODAY, todayUnix), null);
});

test('бронь целиком в прошлом — не переносим', () => {
    assert.equal(planBookingPeriod('2026-08-10', '2026-08-14', todayUnix), null);
});

test('гость заехал раньше и ещё живёт — переносим с сегодняшнего дня', () => {
    const period = planBookingPeriod('2026-08-15', '2026-08-21', todayUnix);

    assert.deepEqual(period, {
        start: dateToUnix(TODAY, 14),
        end: dateToUnix('2026-08-21', 12),
    });
    assert.ok(period.end > period.start, 'конец обязан быть позже начала');
});

test('будущая бронь переносится как есть', () => {
    const period = planBookingPeriod('2026-09-01', '2026-09-05', todayUnix);

    assert.deepEqual(period, {
        start: dateToUnix('2026-09-01', 14),
        end: dateToUnix('2026-09-05', 12),
    });
});

test('заезд и выезд в один день — переносить нечего', () => {
    assert.equal(planBookingPeriod('2026-09-01', '2026-09-01', todayUnix), null);
});

test('бронь начинается сегодня — начало остаётся сегодняшним', () => {
    const period = planBookingPeriod(TODAY, '2026-08-20', todayUnix);

    assert.equal(period.start, dateToUnix(TODAY, 14));
    assert.ok(period.end > period.start);
});

test('у любого перенесённого периода конец позже начала', () => {
    // Перебираем все пары дат в окне ±10 дней вокруг сегодняшнего.
    const day = (shift) => new Date(Date.UTC(2026, 7, 18 + shift)).toISOString().slice(0, 10);

    for (let from = -10; from <= 10; from += 1) {
        for (let to = -10; to <= 10; to += 1) {
            const period = planBookingPeriod(day(from), day(to), todayUnix);

            if (period) {
                assert.ok(
                    period.end > period.start,
                    `битый период для ${day(from)}–${day(to)}`,
                );
            }
        }
    }
});
