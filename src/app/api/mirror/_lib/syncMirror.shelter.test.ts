import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ShelterMirrorSource } from './mirrorSources';
import { syncShelter } from './syncMirror';

const NIGHT = 86400;

const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });

describe('syncShelter', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('не двигает ручные брони и заменяет только внешние метки через RPC', async () => {
        vi.stubEnv('TRANSACTIONAL_ICAL_MIN_RETAINED_RATIO', '0.5');
        vi.stubEnv('TRANSACTIONAL_ICAL_CONFIRM_LARGE_DECREASE', 'false');
        const date = new Date().toISOString().slice(0, 10);
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(jsonResponse({ data: [{ roomCategoryID: 10, date }] }))
                .mockResolvedValueOnce(jsonResponse({ data: [[{ id: 10, availableRooms: 0 }]] })),
        );

        const todayNight = Math.floor(Date.now() / 1000 / NIGHT);
        const manualReserve = {
            id: 'manual-1',
            room_id: 'room-2',
            start: todayNight * NIGHT,
            end: (todayNight + 1) * NIGHT,
            external_source: null,
        };
        const existingMarker = {
            id: 'external-1',
            room_id: 'room-1',
            start: todayNight * NIGHT,
            end: (todayNight + 1) * NIGHT,
            external_source: 'mirror_shelter',
        };
        const inRooms = vi.fn().mockResolvedValue({
            data: [manualReserve, existingMarker],
            error: null,
        });
        const select = vi.fn().mockReturnValue({ in: inRooms });
        const from = vi.fn().mockReturnValue({ select });
        const rpc = vi.fn().mockResolvedValue({
            data: { status: 'ok', inserted: 1, skipped_manual: 0 },
            error: null,
        });
        const supabase = { from, rpc } as unknown as SupabaseClient;
        const source: ShelterMirrorSource = {
            system: 'shelter',
            token: 'public-widget-token',
            widgetUrl: 'https://example.test/book/',
            categories: [{ categoryId: 10, roomIds: ['room-1', 'room-2'] }],
        };

        const result = await syncShelter(supabase, 'hotel-1', source, { horizonDays: 1 });

        expect(from).toHaveBeenCalledTimes(1);
        expect(from).toHaveBeenCalledWith('reserves');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith(
            'sync_external_occupancy',
            expect.objectContaining({
                p_source: 'mirror_shelter',
                p_room_ids: ['room-1', 'room-2'],
                p_source_complete: true,
                p_confirm_empty: false,
                p_min_retained_ratio: 0.5,
            }),
        );
        const rpcPayload = rpc.mock.calls[0][1] as { p_marks: Array<{ room_id: string }> };
        expect(rpcPayload.p_marks).toEqual([expect.objectContaining({ room_id: 'room-1' })]);
        expect(manualReserve.room_id).toBe('room-2');
        expect(result.movedBookings).toBe(0);
        expect(result.inserted).toBe(1);
    });
});
