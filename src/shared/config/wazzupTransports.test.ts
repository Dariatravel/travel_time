import { describe, expect, it } from 'vitest';

import { isWazzupTransportAccepted, WAZZUP_ACCEPTED_TRANSPORTS } from './wazzupTransports';

describe('разрешённые каналы Wazzup', () => {
    it('пока только Instagram: WhatsApp и MAX ещё в ОКО', () => {
        expect(WAZZUP_ACCEPTED_TRANSPORTS).toEqual(['instagram']);
        expect(isWazzupTransportAccepted('instagram')).toBe(true);
        expect(isWazzupTransportAccepted(' Instagram ')).toBe(true);
        for (const other of ['whatsapp', 'wapi', 'max', 'maxbot', 'telegram', 'vk', 'avito', '']) {
            expect(isWazzupTransportAccepted(other)).toBe(false);
        }
        expect(isWazzupTransportAccepted(null)).toBe(false);
        expect(isWazzupTransportAccepted(undefined)).toBe(false);
    });
});
