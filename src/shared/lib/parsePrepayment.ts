/**
 * Приводит предоплату к числу.
 *
 * В базе колонка reserves.prepayment имеет тип text, поэтому из Supabase
 * значение приходит строкой ("5000", "" и т.п.), хотя в типах фигурирует
 * number. Единая точка приведения: пусто/невалидное -> 0, иначе конечное
 * число. Раньше это приведение дублировалось ad-hoc в нескольких местах
 * (Number(...), +value, локальный parsePrepayment в экспорте).
 */
export const parsePrepayment = (value: number | string | null | undefined): number => {
    if (value == null || value === '') {
        return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
