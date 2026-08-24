#!/usr/bin/env node

import {
    buildIncidents,
    chunkAlertMessages,
    planAlertStateChanges,
} from './lib/syncFreshnessAlerts.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const repository = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;

const requiredNumber = (name, fallback) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} должен быть положительным числом`);
    return value;
};

const parseJsonObject = (name, fallback) => {
    const value = JSON.parse(process.env[name] || fallback);
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new Error(`${name} должен быть JSON-объектом`);
    }
    return value;
};

const errorWindowHours = requiredNumber('SYNC_FRESHNESS_ERROR_WINDOW_HOURS', 1);
const defaultStaleHours = requiredNumber('SYNC_FRESHNESS_STALE_HOURS', 8);
const staleHoursBySource = parseJsonObject(
    'SYNC_FRESHNESS_SOURCE_HOURS',
    '{"bnovo_djannat":6,"mirror_shelter":8}',
);
const monitoredSources = (process.env.SYNC_FRESHNESS_MONITORED_SOURCES || 'bnovo_djannat,mirror_shelter')
    .split(',')
    .map((source) => source.trim())
    .filter(Boolean);
const monitoredWorkflows = parseJsonObject(
    'SYNC_FRESHNESS_WORKFLOWS',
    JSON.stringify({
        'bnovo-sync-cron.yml': { label: 'Bnovo (Джаннат)', maxAgeHours: 6 },
        'googlesheet-sync-cron.yml': { label: 'Google/WPS-таблицы', maxAgeHours: 6 },
        'ical-sync-cron.yml': { label: 'RealtyCalendar iCal', maxAgeHours: 12 },
        'mirror-sync-cron.yml': { label: 'зеркала Shelter / FrontDesk24', maxAgeHours: 8 },
    }),
);

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны');
}

const supabaseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
};

const readJson = async (response, context) => {
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!response.ok) {
        const detail = typeof data === 'string' ? data : data?.message ?? JSON.stringify(data);
        throw new Error(`${context}: HTTP ${response.status}: ${detail}`);
    }
    return data;
};

const supabaseRequest = async (path, options = {}) => {
    const response = await fetch(`${supabaseUrl}${path}`, {
        ...options,
        headers: { ...supabaseHeaders, ...options.headers },
        signal: AbortSignal.timeout(30_000),
    });
    return readJson(response, path);
};

const loadSnapshot = () =>
    supabaseRequest('/rest/v1/rpc/get_sync_freshness_snapshot', {
        method: 'POST',
        body: JSON.stringify({
            p_error_window_hours: errorWindowHours,
            p_default_stale_hours: defaultStaleHours,
            p_stale_hours_by_source: staleHoursBySource,
            p_monitored_sources: monitoredSources,
        }),
    });

const loadAlertStates = () =>
    supabaseRequest('/rest/v1/sync_alert_states?select=*', { method: 'GET' });

const loadStaleWorkflows = async (now) => {
    if (!repository || !githubToken) {
        throw new Error('GITHUB_REPOSITORY и GITHUB_TOKEN обязательны для проверки расписаний');
    }

    const checks = await Promise.all(
        Object.entries(monitoredWorkflows).map(async ([file, settings]) => {
            const maxAgeHours = Number(settings.maxAgeHours);
            if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
                throw new Error(`Некорректный maxAgeHours для ${file}`);
            }

            const response = await fetch(
                `https://api.github.com/repos/${repository}/actions/workflows/${file}/runs?status=success&per_page=1`,
                {
                    headers: {
                        Accept: 'application/vnd.github+json',
                        Authorization: `Bearer ${githubToken}`,
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                    signal: AbortSignal.timeout(30_000),
                },
            );
            const data = await readJson(response, `GitHub Actions ${file}`);
            const lastSuccessAt = data.workflow_runs?.[0]?.updated_at ?? null;
            const hoursSinceSuccess = lastSuccessAt
                ? (now.getTime() - new Date(lastSuccessAt).getTime()) / 3_600_000
                : Number.POSITIVE_INFINITY;

            if (hoursSinceSuccess <= maxAgeHours) return null;

            return {
                file,
                label: settings.label || file,
                lastSuccessAt,
                hoursSinceSuccess: Number.isFinite(hoursSinceSuccess)
                    ? Math.round(hoursSinceSuccess * 10) / 10
                    : null,
                maxAgeHours,
            };
        }),
    );

    return checks.filter(Boolean);
};

const sendTelegram = async (text) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = (process.env.TELEGRAM_MANAGER_CHAT_IDS || '')
        .split(',')
        .map((chatId) => chatId.trim())
        .filter(Boolean);

    if (!token || chatIds.length === 0) {
        throw new Error('Нет TELEGRAM_BOT_TOKEN или TELEGRAM_MANAGER_CHAT_IDS');
    }

    for (const chatId of chatIds) {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
            signal: AbortSignal.timeout(30_000),
        });
        const data = await readJson(response, `Telegram, чат ${chatId}`);
        if (data?.ok !== true) throw new Error(`Telegram, чат ${chatId}: ответ без ok=true`);
    }
};

const saveStates = async (activeStates, resolvedStates) => {
    const rows = [...activeStates, ...resolvedStates];
    if (rows.length === 0) return;

    await supabaseRequest('/rest/v1/sync_alert_states?on_conflict=alert_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
};

const main = async () => {
    const now = new Date();
    const [snapshot, storedStates, staleWorkflows] = await Promise.all([
        loadSnapshot(),
        loadAlertStates(),
        loadStaleWorkflows(now),
    ]);
    const incidents = buildIncidents(snapshot, staleWorkflows);
    const plan = planAlertStateChanges(incidents, storedStates ?? [], now.toISOString());

    if (plan.notifications.length > 0) {
        for (const message of chunkAlertMessages(plan.notifications)) {
            await sendTelegram(message);
        }
    }

    await saveStates(plan.activeStates, plan.resolvedStates);

    console.log(JSON.stringify({
        status: 'ok',
        activeProblems: incidents.length,
        alertsSent: plan.notifications.length,
        resolvedProblems: plan.resolvedStates.length,
    }));
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
