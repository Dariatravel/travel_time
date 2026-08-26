const SOURCE_LABELS = {
    bnovo_djannat: 'Bnovo',
    googlesheet_femeli: 'Google-таблица',
    googlesheet_sunrise: 'Google-таблица',
    ical_reservationsteps: 'Reservationsteps iCal',
    kontur_bookonline: 'Контур',
    mirror_shelter: 'Shelter / FrontDesk24',
    wps_villa_leona: 'WPS-таблица',
};

const sourceLabel = (source) => SOURCE_LABELS[source] ?? source;
const cleanText = (value, fallback) => String(value ?? '').trim() || fallback;
const limitedText = (value, fallback, maxLength = 600) => {
    const text = cleanText(value, fallback);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
};
const failureFingerprint = (status, error) => {
    if (/неполный ответ/i.test(error)) return `${status}:source_incomplete`;
    if (/не подтвердил пуст/i.test(error)) return `${status}:empty_unconfirmed`;
    if (/подозрительно уменьш/i.test(error)) return `${status}:suspicious_decrease`;
    return `${status}:${error}`;
};

export const buildIncidents = (snapshot, staleWorkflows = []) => {
    const failures = (snapshot?.failures ?? []).map((failure) => {
        const source = cleanText(failure.source, 'неизвестный источник');
        const hotelId = cleanText(failure.hotel_id, 'unknown');
        const status = cleanText(failure.status, 'error');
        const error = limitedText(failure.error, 'обновление завершилось не полностью');

        return {
            alertKey: `sync-failure:${source}:${hotelId}`,
            fingerprint: failureFingerprint(status, error),
            kind: 'failure',
            source,
            sourceLabel: sourceLabel(source),
            hotelTitle: cleanText(failure.hotel_title, 'неизвестный отель'),
            occurredAt: failure.occurred_at ?? null,
            status,
            error,
        };
    });

    const staleSources = (snapshot?.stale ?? []).map((stale) => {
        const source = cleanText(stale.source, 'неизвестный источник');
        const hotelId = cleanText(stale.hotel_id, 'unknown');
        const lastSuccessAt = stale.last_success_at ?? null;

        return {
            alertKey: `sync-stale:${source}:${hotelId}`,
            fingerprint: String(lastSuccessAt ?? 'never'),
            kind: 'stale_source',
            source,
            sourceLabel: sourceLabel(source),
            hotelTitle: cleanText(stale.hotel_title, 'неизвестный отель'),
            lastSuccessAt,
            hoursSinceSuccess: Number(stale.hours_since_success),
            maxAgeHours: Number(stale.max_age_hours),
        };
    });

    const workflows = staleWorkflows.map((workflow) => ({
        alertKey: `workflow-stale:${workflow.file}`,
        fingerprint: String(workflow.lastSuccessAt ?? 'never'),
        kind: 'stale_workflow',
        workflowFile: workflow.file,
        workflowLabel: workflow.label,
        lastSuccessAt: workflow.lastSuccessAt ?? null,
        hoursSinceSuccess: workflow.hoursSinceSuccess,
        maxAgeHours: workflow.maxAgeHours,
    }));

    return [...failures, ...staleSources, ...workflows];
};

export const planAlertStateChanges = (incidents, storedStates, nowIso) => {
    const storedByKey = new Map(storedStates.map((state) => [state.alert_key, state]));
    const activeKeys = new Set(incidents.map((incident) => incident.alertKey));
    const notifications = [];

    const activeStates = incidents.map((incident) => {
        const stored = storedByKey.get(incident.alertKey);
        const isSameActiveIncident = stored?.active === true && stored.fingerprint === incident.fingerprint;

        if (!isSameActiveIncident) notifications.push(incident);

        return {
            alert_key: incident.alertKey,
            fingerprint: incident.fingerprint,
            active: true,
            first_seen_at: isSameActiveIncident ? stored.first_seen_at : nowIso,
            last_seen_at: nowIso,
            last_alerted_at: isSameActiveIncident ? stored.last_alerted_at : nowIso,
            resolved_at: null,
            details: incident,
        };
    });

    const resolvedStates = storedStates
        .filter((state) => state.active === true && !activeKeys.has(state.alert_key))
        .map((state) => ({
            ...state,
            active: false,
            last_seen_at: nowIso,
            resolved_at: nowIso,
        }));

    return { notifications, activeStates, resolvedStates };
};

const formatHours = (hours) => (Number.isFinite(hours) ? String(hours).replace('.', ',') : 'неизвестно');

export const formatAlertMessage = (incidents) => {
    const blocks = incidents.map((incident) => {
        if (incident.kind === 'failure') {
            return `Отель «${incident.hotelTitle}»: обновление из «${incident.sourceLabel}» завершилось с ошибкой.\nПричина: ${incident.error}`;
        }

        if (incident.kind === 'stale_source') {
            return `Отель «${incident.hotelTitle}»: данные из «${incident.sourceLabel}» не обновлялись ${formatHours(incident.hoursSinceSuccess)} ч. Допустимый интервал — ${formatHours(incident.maxAgeHours)} ч.`;
        }

        return `Процесс «${incident.workflowLabel}» не завершался успешно ${formatHours(incident.hoursSinceSuccess)} ч. Допустимый интервал — ${formatHours(incident.maxAgeHours)} ч.`;
    });

    return [
        '⚠️ Занятость могла перестать обновляться',
        '',
        ...blocks.flatMap((block, index) => (index === 0 ? [block] : ['', block])),
        '',
        'До исправления проверяйте даты напрямую у отельера.',
    ].join('\n');
};

export const chunkAlertMessages = (incidents, maxLength = 3500) => {
    const chunks = [];
    let current = [];

    for (const incident of incidents) {
        const candidate = [...current, incident];
        if (current.length > 0 && formatAlertMessage(candidate).length > maxLength) {
            chunks.push(formatAlertMessage(current));
            current = [incident];
        } else {
            current = candidate;
        }
    }

    if (current.length > 0) chunks.push(formatAlertMessage(current));
    return chunks;
};
