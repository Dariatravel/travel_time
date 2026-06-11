import supabase from '@/shared/config/supabase';

const SEARCH_VISIBILITY_COLUMN = 'is_search_visible';

type SupabaseLikeError = {
    message?: string;
    code?: string;
};

/** Колонка ещё не применена в Supabase — не ломаем поиск, работаем как раньше. */
export function isSearchVisibilityColumnMissing(error: SupabaseLikeError | null): boolean {
    if (!error) return false;

    return (
        error.code === '42703' ||
        (error.message ?? '').includes(SEARCH_VISIBILITY_COLUMN) ||
        ((error.message ?? '').includes('column') &&
            (error.message ?? '').includes('does not exist'))
    );
}

/** ID отелей, скрытых из поиска. null = колонка недоступна, фильтр не применяем. */
export async function getHiddenFromSearchHotelIds(): Promise<Set<string> | null> {
    const { data, error } = await supabase
        .from('hotels')
        .select('id')
        .eq('is_search_visible', false);

    if (error) {
        if (isSearchVisibilityColumnMissing(error)) {
            console.warn(
                '[searchVisibility] column is_search_visible is missing, search filter skipped',
            );
            return null;
        }

        throw error;
    }

    return new Set((data ?? []).map((row) => row.id));
}

export function excludeHiddenHotelsById<T extends { hotel_id: string }>(
    hotels: T[],
    hiddenIds: Set<string> | null,
): T[] {
    if (!hiddenIds || hiddenIds.size === 0) {
        return hotels;
    }

    return hotels.filter((hotel) => !hiddenIds.has(hotel.hotel_id));
}

export function excludeHiddenHotelRows<T extends { id: string }>(
    hotels: T[],
    hiddenIds: Set<string> | null,
): T[] {
    if (!hiddenIds || hiddenIds.size === 0) {
        return hotels;
    }

    return hotels.filter((hotel) => !hiddenIds.has(hotel.id));
}

export function excludeHiddenHotelIds(
    hotelIds: string[],
    hiddenIds: Set<string> | null,
): string[] {
    if (!hiddenIds || hiddenIds.size === 0) {
        return hotelIds;
    }

    return hotelIds.filter((id) => !hiddenIds.has(id));
}
