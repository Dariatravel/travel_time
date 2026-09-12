import { isAdminRole, isHotelierRole } from '@/shared/lib/userRoles';

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

/** Клиенты и сделки (этап 3): канбан, контакты, импорт из OKO. */
export const isCrmEnabled = (role?: string | null): boolean => isAdminRole(role);

/** Финансы с отелями (этап 4): решение Дарьи — на старте только у неё. */
export const isFinanceEnabled = (role?: string | null): boolean => isAdminRole(role);

/**
 * Кабинет отельера («Мои расчёты»): роль hotel и admin (для проверки).
 * Что именно видно — решает база: только отели с hotel_terms.hotelier_visible.
 */
export const isHotelierCabinetEnabled = (role?: string | null): boolean =>
    isHotelierRole(role) || isAdminRole(role);
