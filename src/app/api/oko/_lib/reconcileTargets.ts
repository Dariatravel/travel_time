/**
 * Кого сверять с ОКО за один заход Mac mini (13.09.2026).
 *
 * Сначала контакты «ждущих» чатов: вебхук ОКО не присылает ответы
 * менеджеров, и без сверки «Входящие» не отличат неотвеченный чат от
 * отвеченного в самом ОКО. Оставшиеся места — старому кругу, который
 * добирает пропущенное вебхуком.
 */

export type WaitingTarget = { oko_contact_id: number; waiting_since: string | null; unchecked: boolean };
export type CircleTarget = { oko_contact_id: number; client_name: string | null };

export type Target = {
    oko_contact_id: number;
    client_name: string | null;
    причина: 'ждёт ответа' | 'перепроверка ждущего' | 'круг';
};

export const mergeTargets = (waiting: WaitingTarget[], circle: CircleTarget[], limit: number): Target[] => {
    const result: Target[] = [];
    const seen = new Set<number>();
    const add = (target: Target) => {
        if (result.length >= limit || !target.oko_contact_id || seen.has(target.oko_contact_id)) return;
        seen.add(target.oko_contact_id);
        result.push(target);
    };

    for (const w of waiting) {
        add({
            oko_contact_id: w.oko_contact_id,
            client_name: null,
            причина: w.unchecked ? 'ждёт ответа' : 'перепроверка ждущего',
        });
    }
    for (const c of circle) {
        add({ oko_contact_id: c.oko_contact_id, client_name: c.client_name, причина: 'круг' });
    }

    return result;
};
