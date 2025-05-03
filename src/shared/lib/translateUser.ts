// Функция для перевода статуса
import { UserRole } from '@/shared/api/auth/auth'

export const translateUserRole = (role: UserRole) => {
  const translations = {
    [UserRole.ADMIN]: 'Админ',
    [UserRole.HOTEL]: 'Отельер',
    [UserRole.OPERATOR]: 'Оператор',
  }
  return translations[role] ?? role // Если перевод не найден, вернуть оригинальное значение
}
