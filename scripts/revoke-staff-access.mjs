#!/usr/bin/env node
/**
 * Закрыть доступ уволенным сотрудникам по email (через запятую в REVOKE_EMAILS).
 *
 * Что делает с каждым: удаляет строку в public.user_roles (без роли нет доступа
 * ни к опросу, ни к чужим отелям/броням) и блокирует вход в Supabase Auth
 * (ban на 100 лет). Учётку НЕ удаляет: на неё могут ссылаться брони и
 * назначения, и блокировку можно снять, если ошиблись.
 *
 * Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const emails = (process.env.REVOKE_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
if (!url || !key) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
if (emails.length === 0) {
    console.error('Передайте REVOKE_EMAILS — email через запятую');
    process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const usersResponse = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
if (!usersResponse.ok) throw new Error(`auth users: HTTP ${usersResponse.status}`);
const { users } = await usersResponse.json();

let failed = 0;
for (const email of emails) {
    const user = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (!user) {
        console.log(`  ? ${email}: учётка не найдена — пропуск`);
        failed += 1;
        continue;
    }
    const roleResponse = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${user.id}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=representation' },
    });
    if (!roleResponse.ok) throw new Error(`${email}: user_roles DELETE HTTP ${roleResponse.status}`);
    const removedRoles = await roleResponse.json();

    const banResponse = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ban_duration: '876000h' }),
    });
    if (!banResponse.ok) throw new Error(`${email}: ban HTTP ${banResponse.status}`);

    const name = [user.user_metadata?.name, user.user_metadata?.surname].filter(Boolean).join(' ') || '(без имени)';
    console.log(
        `  ✓ ${name} — ${email}: роль снята (${removedRoles.map((r) => r.role).join(', ') || 'роли не было'}), вход заблокирован`,
    );
}
console.log(`\nГотово: закрыт доступ ${emails.length - failed} из ${emails.length}`);
process.exit(failed ? 1 : 0);
