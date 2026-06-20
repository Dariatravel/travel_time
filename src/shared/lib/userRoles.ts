import { UserRole } from '@/shared/api/auth/auth';

export const isAdminRole = (role?: string | null) => role === UserRole.ADMIN;

export const isOperatorRole = (role?: string | null) => role === UserRole.OPERATOR;

export const isHotelierRole = (role?: string | null) => role === UserRole.HOTEL;

/** Админ и оператор — полный доступ к истории на дашборде */
export const isStaffRole = (role?: string | null) => isAdminRole(role) || isOperatorRole(role);
