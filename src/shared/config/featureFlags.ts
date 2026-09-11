import { isAdminRole, isStaffRole } from '@/shared/lib/userRoles';

/**
 * Флаги функций единой программы (правило из CLAUDE.md: новое — только за
 * флагом и/или для роли admin).
 *
 * NEXT_PUBLIC_FEATURE_BOOKING_CARD=true открывает карточку брони операторам.
 * Без флага её видит только admin — так функция сначала проверяется Дарьей
 * на тестовом контуре, потом на рабочем, и только затем открывается менеджерам.
 */
export const isBookingCardEnabled = (role?: string | null): boolean => {
    if (isAdminRole(role)) return true;

    return process.env.NEXT_PUBLIC_FEATURE_BOOKING_CARD === 'true' && isStaffRole(role);
};
