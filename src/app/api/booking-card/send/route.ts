import { requireStaff } from '@/app/api/survey/_lib/requireStaff';
import {
    sendDocumentDirect,
    sendDocumentViaGithub,
    sendMessageStrict,
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
 * Порядок важен: сначала все проверки (бронь существует, чат и бот настроены),
 * потом отправка, потом запись в карточку. Если запись после успешной отправки
 * не удалась — отвечаем «отправлено, но не отмечено», а не ошибкой, чтобы
 * менеджер не нажал ещё раз и в чат не ушёл дубль.
 *
 * Файл кладётся в Storage (bucket «vouchers», закрытый) под ASCII-ключом —
 * имя с ФИО гостя уходит только как имя файла получателю. Отправка: напрямую
 * в Telegram, а если контейнер до него не дотянулся — через GitHub Actions
 * (telegram-send-file.yml), который берёт файл из Storage.
 */

const BUCKET = 'vouchers';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KINDS = new Set(['booking', 'cancel', 'transfer', 'change']);
const STATUSES = new Set(['booked', 'changed', 'transferred', 'cancelled']);

const ensureBucket = async (client: ReturnType<typeof createSupabaseServiceRoleClient>) => {
    const { error } = await client.storage.createBucket(BUCKET, { public: false });
    // «уже существует» — норма; любую другую ошибку показываем.
    if (error && !/exist/i.test(error.message)) {
        throw new Error(`Storage: ${error.message}`);
    }
};

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
    const auth = await requireStaff(request);
    if ('error' in auth) return auth.error;

    const chatId = process.env.TELEGRAM_BOOKING_CHAT_ID;
    if (!chatId) {
        return bad(
            'Чат броней не настроен (TELEGRAM_BOOKING_CHAT_ID). Скачайте файл и отправьте руками.',
        );
    }
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        return bad('На этом контуре отправка в Telegram отключена. Скачайте файл и отправьте руками.');
    }

    try {
        const form = await request.formData();
        const reserveId = String(form.get('reserveId') ?? '');
        const kind = String(form.get('kind') ?? '');
        const caption = String(form.get('caption') ?? '').slice(0, 1000).trim();
        const nextStatus = String(form.get('status') ?? '');
        const actor = String(form.get('actor') ?? '').slice(0, 120).trim() || auth.user.email || auth.user.id;
        const file = form.get('file');

        if (!/^[0-9a-f-]{36}$/i.test(reserveId)) return bad('Нет идентификатора брони');
        if (!KINDS.has(kind)) return bad('Неизвестный тип отправки');
        if (!caption) return bad('Пустая подпись');
        if (nextStatus && !STATUSES.has(nextStatus)) return bad('Неизвестный статус');
        if (file instanceof File && file.size > MAX_FILE_BYTES) return bad('Файл больше 5 МБ', 413);

        const service = createSupabaseServiceRoleClient();
        const { data: reserveRow, error: reserveError } = await service
            .from('reserves')
            .select('id, guest')
            .eq('id', reserveId)
            .maybeSingle();
        if (reserveError) throw new Error(`reserves: ${reserveError.message}`);
        if (!reserveRow) return bad('Бронь не найдена — возможно, удалена', 404);

        let delivery: 'direct' | 'github' | 'text' = 'text';
        let storagePath: string | null = null;

        if (file instanceof File && file.size > 0) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const fileName = (file.name || 'voucher.pdf').replace(/[\\/:*?"<>|]+/g, ' ').trim();
            storagePath = `${reserveId}/${Date.now()}.pdf`;

            await ensureBucket(service);
            const { error: uploadError } = await service.storage
                .from(BUCKET)
                .upload(storagePath, bytes, { contentType: 'application/pdf' });
            if (uploadError) throw new Error(`Storage upload: ${uploadError.message}`);

            try {
                await sendDocumentDirect(chatId, { name: fileName, bytes, mime: 'application/pdf' }, caption);
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
            delivery = (await sendMessageStrict(chatId, caption)) === 'github' ? 'github' : 'text';
        }

        // Отправлено. Всё, что ниже, — учёт; его сбой не должен выглядеть как «не отправлено».
        const now = new Date().toISOString();
        const cardPatch: Record<string, unknown> = { updated_at: now, updated_by: actor };
        if (kind === 'booking' || kind === 'change') cardPatch.chat_sent_at = now;
        if (kind === 'change' || kind === 'transfer') cardPatch.voucher_generated_at = now;
        if (storagePath) cardPatch.voucher_path = `${BUCKET}/${storagePath}`;
        if (nextStatus) cardPatch.status = nextStatus;

        try {
            const { data: current } = await service
                .from('booking_cards')
                .select('status')
                .eq('reserve_id', reserveId)
                .maybeSingle();
            const { error: cardError } = await service
                .from('booking_cards')
                .upsert({ reserve_id: reserveId, ...cardPatch }, { onConflict: 'reserve_id' });
            if (cardError) throw new Error(`booking_cards: ${cardError.message}`);

            const events: Record<string, unknown>[] = [
                {
                    reserve_id: reserveId,
                    event: 'chat_sent',
                    details: { kind, caption, delivery, storage_path: storagePath },
                    created_by: actor,
                },
            ];
            if (nextStatus && nextStatus !== (current?.status ?? 'booked')) {
                events.push({
                    reserve_id: reserveId,
                    event: 'status_changed',
                    details: { from: current?.status ?? 'booked', to: nextStatus, guest: reserveRow.guest },
                    created_by: actor,
                });
            }
            const { error: eventError } = await service.from('booking_card_events').insert(events);
            if (eventError) throw new Error(`booking_card_events: ${eventError.message}`);
        } catch (recordError) {
            console.error('Отправлено, но не записано в карточку:', recordError);

            return NextResponse.json({
                ok: true,
                delivery,
                sentAt: now,
                warning:
                    'Отправлено в чат, но не отмечено в карточке. Повторно НЕ отправляйте — отметьте руками.',
            });
        }

        return NextResponse.json({ ok: true, delivery, sentAt: now });
    } catch (error) {
        return toErrorResponse(error, 'Не удалось отправить в чат');
    }
}
