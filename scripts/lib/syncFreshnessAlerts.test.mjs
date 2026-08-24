import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    buildIncidents,
    chunkAlertMessages,
    formatAlertMessage,
    planAlertStateChanges,
} from './syncFreshnessAlerts.mjs';

const NOW = '2026-08-24T09:00:00.000Z';

describe('оповещения о свежести синхронизаций', () => {
    it('не повторяет одну и ту же активную проблему каждый час', () => {
        const incidents = buildIncidents({
            failures: [{
                source: 'bnovo_djannat',
                hotel_id: 'hotel-1',
                hotel_title: 'Джаннат',
                status: 'error',
                error: 'кабинет недоступен',
            }],
            stale: [],
        });
        const stored = [{
            alert_key: incidents[0].alertKey,
            fingerprint: incidents[0].fingerprint,
            active: true,
            first_seen_at: '2026-08-24T08:00:00.000Z',
            last_alerted_at: '2026-08-24T08:00:00.000Z',
        }];

        const plan = planAlertStateChanges(incidents, stored, NOW);

        assert.equal(plan.notifications.length, 0);
        assert.equal(plan.activeStates[0].first_seen_at, stored[0].first_seen_at);
    });

    it('считает разные количества одной защитной ошибкой, а не новыми авариями', () => {
        const first = buildIncidents({
            failures: [{
                source: 'ical_reservationsteps',
                hotel_id: 'hotel-1',
                status: 'error',
                error: 'Число iCal-меток подозрительно уменьшилось: 61 -> 20',
            }],
            stale: [],
        })[0];
        const second = buildIncidents({
            failures: [{
                source: 'ical_reservationsteps',
                hotel_id: 'hotel-1',
                status: 'error',
                error: 'Число iCal-меток подозрительно уменьшилось: 61 -> 18',
            }],
            stale: [],
        })[0];

        assert.equal(first.fingerprint, second.fingerprint);
    });

    it('повторно сообщает, если проблема изменилась или вернулась после решения', () => {
        const incidents = buildIncidents({
            failures: [{
                source: 'mirror_shelter',
                hotel_id: 'hotel-2',
                hotel_title: 'Нора',
                status: 'error',
                error: 'новая причина',
            }],
            stale: [],
        });
        const changed = planAlertStateChanges(incidents, [{
            alert_key: incidents[0].alertKey,
            fingerprint: 'error:старая причина',
            active: true,
        }], NOW);
        const returned = planAlertStateChanges(incidents, [{
            alert_key: incidents[0].alertKey,
            fingerprint: incidents[0].fingerprint,
            active: false,
        }], NOW);

        assert.equal(changed.notifications.length, 1);
        assert.equal(returned.notifications.length, 1);
    });

    it('закрывает исчезнувшую проблему и формирует понятный текст', () => {
        const plan = planAlertStateChanges([], [{
            alert_key: 'workflow-stale:mirror-sync-cron.yml',
            fingerprint: 'never',
            active: true,
        }], NOW);
        const message = formatAlertMessage(buildIncidents({ failures: [], stale: [] }, [{
            file: 'mirror-sync-cron.yml',
            label: 'зеркала Shelter',
            lastSuccessAt: null,
            hoursSinceSuccess: 9,
            maxAgeHours: 8,
        }]));

        assert.equal(plan.resolvedStates.length, 1);
        assert.match(message, /Занятость могла перестать обновляться/);
        assert.match(message, /проверяйте даты напрямую у отельера/);
        assert.doesNotMatch(message, /status=/);
    });

    it('делит длинное оповещение на несколько сообщений Telegram', () => {
        const incidents = Array.from({ length: 12 }, (_, index) => ({
            alertKey: `failure:${index}`,
            fingerprint: 'error',
            kind: 'failure',
            sourceLabel: 'Источник',
            hotelTitle: `Отель ${index}`,
            error: 'длинное описание '.repeat(30),
        }));

        const chunks = chunkAlertMessages(incidents, 1000);

        assert.ok(chunks.length > 1);
        assert.ok(chunks.every((chunk) => chunk.length <= 1000));
    });
});
