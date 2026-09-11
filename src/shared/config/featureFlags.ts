import { isAdminRole } from '@/shared/lib/userRoles';

/**
 * Флаги функций единой программы (правило из CLAUDE.md: новое — только за
 * флагом и/или для роли admin).
 *
 * Карточка брони сейчас доступна только admin: данные (RLS booking_cards)
 * и серверный роут тоже пускают только admin, поэтому открывать интерфейс
 * операторам раньше базы нельзя — они увидели бы сломанный экран.
 * Открытие операторам — одним PR: политика IN ('admin','operator') в базе,
 * requireStaff в роуте и isStaffRole здесь.
 */
export const isBookingCardEnabled = (role?: string | null): boolean => isAdminRole(role);

/** «Утро менеджера» (этап 2) — те же правила доступа, что и у карточки брони. */
export const isMorningEnabled = (role?: string | null): boolean => isAdminRole(role);
