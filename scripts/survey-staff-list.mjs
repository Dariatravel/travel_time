#!/usr/bin/env node
/**
 * Список сотрудников (admin + operator) — участников опроса по объектам.
 * Печатает имя, роль и email. Нужны NEXT_PUBLIC_SUPABASE_URL и
 * SUPABASE_SERVICE_ROLE_KEY (GitHub Secrets, workflow survey-staff-list.yml).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const rolesResponse = await fetch(`${url}/rest/v1/user_roles?select=user_id,role&role=in.(admin,operator)`, {
    headers,
});
if (!rolesResponse.ok) throw new Error(`user_roles: HTTP ${rolesResponse.status}`);
const roles = await rolesResponse.json();

const usersResponse = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers });
if (!usersResponse.ok) throw new Error(`auth users: HTTP ${usersResponse.status}`);
const { users } = await usersResponse.json();

const roleById = new Map(roles.map((r) => [r.user_id, r.role]));
const staff = users
    .filter((u) => roleById.has(u.id))
    .map((u) => ({
        role: roleById.get(u.id),
        name: [u.user_metadata?.name, u.user_metadata?.surname].filter(Boolean).join(' ') || '(без имени)',
        email: u.email ?? '',
        lastSignIn: u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : 'никогда',
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'ru'));

console.log(`Сотрудники с доступом к опросу: ${staff.length}\n`);
for (const role of ['admin', 'operator']) {
    const group = staff.filter((s) => s.role === role);
    console.log(`=== ${role === 'admin' ? 'Администраторы' : 'Операторы'}: ${group.length} ===`);
    for (const s of group) console.log(`  ${s.name} — ${s.email} (последний вход: ${s.lastSignIn})`);
    console.log('');
}
