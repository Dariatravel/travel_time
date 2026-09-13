/**
 * Поддельный клиент Supabase для тестов маршрутов Wazzup. Запоминает каждый
 * запрос (таблица, операция, данные, цепочка фильтров) и отвечает тем, что
 * вернёт respond. Сети и базы нет.
 */

export type FakeCall = {
    target: string;
    op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
    payload: unknown;
    chain: { method: string; args: unknown[] }[];
};

export type FakeResult = {
    data?: unknown;
    error?: { message: string; code?: string } | null;
    count?: number | null;
};

export const hasFilter = (call: FakeCall, method: string, ...args: unknown[]): boolean =>
    call.chain.some(
        (link) => link.method === method && args.every((arg, index) => JSON.stringify(link.args[index]) === JSON.stringify(arg)),
    );

export const createFakeSupabase = (respond: (call: FakeCall) => FakeResult | undefined) => {
    const calls: FakeCall[] = [];

    const builder = (target: string, op: FakeCall['op'], payload: unknown, first?: { method: string; args: unknown[] }) => {
        const call: FakeCall = { target, op, payload, chain: first ? [first] : [] };
        const proxy: object = new Proxy(
            {},
            {
                get(_target, prop) {
                    if (prop === 'then') {
                        return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
                            calls.push(call);
                            try {
                                const result = respond(call) ?? {};
                                resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
                            } catch (error) {
                                reject(error);
                            }
                        };
                    }

                    return (...args: unknown[]) => {
                        call.chain.push({ method: String(prop), args });

                        return proxy;
                    };
                },
            },
        );

        return proxy;
    };

    const client = {
        from: (table: string) => ({
            select: (...args: unknown[]) => builder(table, 'select', null, { method: 'select', args }),
            insert: (payload: unknown) => builder(table, 'insert', payload),
            update: (payload: unknown) => builder(table, 'update', payload),
            upsert: (payload: unknown, options?: unknown) =>
                builder(table, 'upsert', payload, { method: 'options', args: [options] }),
            delete: () => builder(table, 'delete', null),
        }),
        rpc: (fn: string, args: unknown) => builder(`rpc:${fn}`, 'rpc', args),
    };

    return { client, calls };
};
