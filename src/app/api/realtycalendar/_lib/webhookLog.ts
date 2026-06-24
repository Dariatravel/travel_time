import type { SupabaseClient } from '@supabase/supabase-js';

export type WebhookLogEntry = {
    action?: string | null;
    status?: string | null;
    bookingId?: string | null;
    roomId?: string | null;
    rcRoomId?: string | null;
    rcRealtyId?: string | null;
    resultStatus: string;
    resultReason?: string | null;
    payload?: unknown;
    conflicts?: unknown;
};

export const logRealtyCalendarWebhookEvent = async (
    supabase: SupabaseClient,
    entry: WebhookLogEntry,
) => {
    const { error } = await supabase.from('realtycalendar_webhook_events').insert({
        action: entry.action ?? null,
        status: entry.status ?? null,
        booking_id: entry.bookingId ?? null,
        room_id: entry.roomId ?? null,
        rc_room_id: entry.rcRoomId ?? null,
        rc_realty_id: entry.rcRealtyId ?? null,
        result_status: entry.resultStatus,
        result_reason: entry.resultReason ?? null,
        payload: entry.payload ?? null,
        conflicts: entry.conflicts ?? null,
    });

    if (error) {
        console.warn('Failed to persist RealtyCalendar webhook log', error.message);
    }
};
