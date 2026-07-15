/**
 * Расчёт времени заезда/выезда по Москве перенесён в общий модуль
 * src/shared/lib/moscowTime.ts — им пользуются и клиент (поиск, формы,
 * перетаскивание), и серверные интеграции. Здесь остаётся ре-экспорт,
 * чтобы не менять импорты вебхука и iCal-синка.
 */
export {
    CHECK_IN_HOUR_MSK,
    CHECK_OUT_HOUR_MSK,
    MOSCOW_UTC_OFFSET_HOURS,
    toMoscowStayUnix,
} from '@/shared/lib/moscowTime';
