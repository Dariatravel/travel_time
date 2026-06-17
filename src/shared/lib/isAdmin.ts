import { UserRole } from '@/shared/api/auth/auth';

export const isAdminRole = (role?: string | null) => role === UserRole.ADMIN;
