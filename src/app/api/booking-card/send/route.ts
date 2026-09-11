import { requireAdmin } from '@/app/api/admin/_lib/requireAdmin';
import {
    sendDocumentDirect,
    sendDocumentViaGithub,
    sendMessage,
} from '@/app/api/telegram/_lib/telegramApi';
import { toErrorResponse } from '@/app/api/yandex-backend/_lib/httpError';
import { createSupabaseServiceRoleClient } from '@/app/api/yandex-backend/_lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Отправка из карточки брони в чат «Королева Абхазии»: ваучер с #бронь,
 * #отмена / #перенос / #изменения. Вызывается только по клику менеджера
 * (правило: брони и подтверждения — через человека).
 *
 * Файл сначала кладётся в Storage (bucket «vouchers»), потом отправка:
 * напрямую в Telegram, а если контейнер до него не дотянулся — через
 * GitHub Actions (telegram-send-file.yml), который берёт файл из Storage.
 * Текст без файла идёт через общий sendMessage с тем же обходом.
 */

const BUCKET = 'vouchers';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KINDS = new Set(['booking', 'cancel', 'transfer', 'change']);

const ensureBucket = async (client: ReturnType<typeof createSupabaseServiceRoleClient>) => {
    const { error } = await client.storage.createBucket(BUCKET, { public: false });
    // «уже существует» — норма; любую другую ошибку показываем.
    if (error && !/exist/i.test(error.message)) {
        throw new Error(`Storage: ${error.message}`);
    }
};

const safePathPart = (value: string) =>
    value.replace(/[^\p{L}\p{N}._ -]+/gu, '_').replace(/\s+/g, ' ').trim().slice(0, 120);

export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if ('error' in auth) return auth.error;

    const chatId = process.env.TELEGRAM_BOOKING_CHAT_ID;
    if (!chatId) {
        return NextResponse.json(
            { error: 'Чат броней не настроен (TELEGRAM_BOOKING_CHAT_ID). Скачайте файл и отправьте руками.' },
            { status: 400 },
        );
    }

    try {
        const form = await request.formData();
        const reserveId = String(form.get('reserveId') ?? '');
        const kind = String(form.get('kind') ?? '');
        const caption = String(form.get('caption') ?? '').slice(0, 1000);
        const file = form.get('file');

        if (!/^[0-9a-f-]{36}$/i.test(reserveId)) {
            return NextResponse.json({ error: 'Нет идентификатора брони' }, { status: 400 });
        }
        if (!KINDS.has(kind)) {
            return NextResponse.json({ error: 'Неизвестный тип отправки' }, { status: 400 });
        }
        if (!caption.trim()) {
            return NextResponse.json({ error: 'Пустая подпись' }, { status: 400 });
        }

        const service = createSupabaseServiceRoleClient();
        const actor = auth.user.email ?? auth.user.id;
        let delivery: 'direct' | 'github' | 'text' = 'text';
        let storagePath: string | null = null;

        if (file instanceof File && file.size > 0) {
            if (file.size > MAX_FILE_BYTES) {
                return NextResponse.json({ error: 'Файл больше 5 МБ' }, { status: 413 });
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            const fileName = safePathPart(file.name || 'voucher.pdf') || 'voucher.pdf';
            storagePath = `${reserveId}/${Date.now()}-${fileName}`;

            await ensureBucket(service);
            const { error: uploadError } = await service.storage
                .from(BUCKET)
                .upload(storagePath, bytes, { contentType: file.type || 'application/pdf' });
            if (uploadError) throw new Error(`Storage upload: ${uploadError.message}`);

            try {
                await sendDocumentDirect(chatId, { name: fileName, bytes, mime: file.type }, caption);
                delivery = 'direct';
            } catch (directError) {
                console.warn(
                    'Прямая отправка файла не удалась, уходим в обход:',
                    directError instanceof Error ? directError.message : directError,
                );
                await sendDocumentViaGithub({
                    chatId,
                    storagePath: `${BUCKET}/${storagePath}`,
                    fileName,
                    caption,
                });
                delivery = 'github';
            }
        } else {
            await sendMessage(chatId, caption);
        }

        const now = new Date().toISOString();
        const cardPatch: Record<string, unknown> = { updated_at: now, updated_by: actor };
        if (kind === 'booking' || kind === 'change') cardPatch.chat_sent_at = now;
        if (storagePath) cardPatch.voucher_path = `${BUCKET}/${storagePath}`;

        const { error: cardError } = await service
            .from('booking_cards')
            .upsert({ reserve_id: reserveId, ...cardPatch }, { onConflict: 'reserve_id' });
        if (cardError) throw new Error(`booking_cards: ${cardError.message}`);

        const { error: eventError } = await service.from('booking_card_events').insert({
            reserve_id: reserveId,
            event: 'chat_sent',
            details: { kind, caption, delivery, storage_path: storagePath },
            created_by: actor,
        });
        if (eventError) throw new Error(`booking_card_events: ${eventError.message}`);

        return NextResponse.json({ ok: true, delivery, sentAt: now });
    } catch (error) {
        return toErrorResponse(error, 'Не удалось отправить в чат');
    }
}
