# Анализ и оптимизация ExportHotels

## 🔴 Проблемы текущего подхода

### 1. **Несогласованность типов**

#### Проблема

```typescript
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title'>;
```

В store `$hotelsFilter` хранятся отели типа `HotelForRoom`, который содержит только `id` и `title`, но для экспорта нужны также `telegram_url`, `phone`, `address`.

#### Почему плохо

- ❌ Приходится использовать `as any` для доступа к полям
- ❌ Теряется type safety
- ❌ TypeScript не может проверить наличие полей
- ❌ Возможны runtime ошибки при отсутствии полей

#### Решение

```typescript
// Вариант 1: Расширить тип HotelForRoom
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title' | 'telegram_url' | 'phone' | 'address'>;

// Вариант 2: Создать отдельный тип для экспорта
export type HotelForExport = Pick<
    HotelDTO,
    'id' | 'title' | 'telegram_url' | 'phone' | 'address' | 'rating' | 'type'
>;

// Вариант 3: Использовать полный HotelDTO в store
```

### 2. **Дублирование данных в разных stores**

#### Проблема

Данные о свободных отелях хранятся в двух местах:

```typescript
// В $hotelsFilter
{
    freeHotels: Map<string, string[]>,  // hotel_id -> room_ids
    freeHotels_id: string[]             // массив hotel_id
}

// В $freeHotelsData
FreeHotelsDTO[]  // полная информация о свободных номерах
```

#### Почему плохо

- ❌ Дублирование данных
- ❌ Нужно синхронизировать два источника
- ❌ Увеличение memory footprint
- ❌ Риск рассинхронизации данных

#### Решение

```typescript
// Вариант 1: Хранить только $freeHotelsData, вычислять Map и ID через derived stores
export const $freeHotelsMap = $freeHotelsData.map((data) =>
    new Map(data.map(h => [h.hotel_id, h.rooms.map(r => r.room_id)]))
);

export const $freeHotelIds = $freeHotelsData.map((data) =>
    data.map(h => h.hotel_id)
);

// Вариант 2: Объединить в один объект
export const $searchResults = createStore<{
    hotels: HotelDTO[];
    freeHotels: FreeHotelsDTO[];
    filters: TravelFilterType;
}>({...});
```

### 3. **Отсутствие нормализации данных**

#### Проблема

Данные хранятся в "сыром" виде без нормализации:

```typescript
$hotelsFilter: {
    hotels: HotelForRoom[],  // массив объектов
    freeHotels: Map<...>
}
```

#### Почему плохо

- ❌ Сложно обновлять отдельные отели
- ❌ Поиск отеля - O(n) вместо O(1)
- ❌ Дублирование данных при множественных ссылках
- ❌ Трудно отслеживать изменения конкретного отеля

#### Решение

```typescript
// Нормализованная структура (как в Redux normalizr)
interface NormalizedHotels {
    byId: Record<string, HotelDTO>;
    allIds: string[];
    freeRoomsByHotelId: Record<string, string[]>;
}

const $normalizedHotels = createStore<NormalizedHotels>({
    byId: {},
    allIds: [],
    freeRoomsByHotelId: {},
});

// Селекторы
export const $hotelsList = $normalizedHotels.map((state) =>
    state.allIds.map((id) => state.byId[id]),
);
```

### 4. **Неэффективное получение данных**

#### Проблема

```typescript
// В SearchForm
const { data: hotels } = useGetHotelsForRoom();  // Получаем ВСЕ отели
const result = await getHotelsWithFreeRooms(...);  // Повторный запрос
```

#### Почему плохо

- ❌ Два отдельных запроса вместо одного
- ❌ Избыточный трафик
- ❌ Медленнее для пользователя
- ❌ Возможна рассинхронизация данных

#### Решение

```typescript
// Вариант 1: Объединить запросы в один API endpoint
const getHotelsWithFilters = async (filters: TravelFilterType) => {
    return {
        hotels: HotelDTO[],
        freeHotels: FreeHotelsDTO[],
        metadata: { ... }
    }
};

// Вариант 2: Использовать GraphQL для точечной загрузки нужных полей
query GetHotelsForExport {
    hotels(filter: $filter) {
        id
        title
        telegram_url
        freeRooms {
            count
            rooms { ... }
        }
    }
}
```

### 5. **Отсутствие кеширования**

#### Проблема

```typescript
// При каждом открытии модалки форматируем заново
const formattedText = formatHotelsWithAvailability(hotels, freeHotelsData);
```

#### Почему плохо

- ❌ Повторные вычисления при каждом рендере
- ❌ Замедление при большом количестве отелей
- ❌ Лишняя нагрузка на CPU

#### Решение

```typescript
// Вариант 1: useMemo
const formattedText = useMemo(
    () => formatHotelsWithAvailability(hotels, freeHotelsData),
    [hotels, freeHotelsData],
);

// Вариант 2: Derived store
export const $formattedHotelsText = combine($hotelsFilter, $freeHotelsData, (hotels, freeData) =>
    formatHotelsWithAvailability(hotels?.hotels || [], freeData),
);
```

### 6. **Отсутствие pagination/virtualization**

#### Проблема

```typescript
{hotels.map((hotel, index) => (
    <tr>...</tr>
))}
```

#### Почему плохо

- ❌ При 1000+ отелях браузер зависнет
- ❌ Рендер всех элементов сразу
- ❌ Медленный scroll
- ❌ Высокое потребление памяти

#### Решение

```typescript
// Вариант 1: React Virtualized
import { FixedSizeList } from 'react-window';

<FixedSizeList
    height={400}
    itemCount={hotels.length}
    itemSize={50}
>
    {({ index, style }) => (
        <div style={style}>{hotels[index].title}</div>
    )}
</FixedSizeList>

// Вариант 2: Pagination
const [page, setPage] = useState(0);
const ITEMS_PER_PAGE = 50;
const displayedHotels = hotels.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
);
```

### 7. **Слабая обработка ошибок**

#### Проблема

```typescript
const success = await copyToClipboard(text);
if (success) {
    showToast('Скопировано', 'success');
} else {
    showToast('Не удалось', 'error');
}
```

#### Почему плохо

- ❌ Пользователь не знает, ПОЧЕМУ не скопировалось
- ❌ Нет логирования ошибок
- ❌ Нет fallback действий
- ❌ Нет аналитики

#### Решение

```typescript
try {
    const success = await copyToClipboard(text);
    if (!success) throw new Error('Clipboard API failed');

    // Логирование успеха
    logEvent('export_hotels_success', {
        hotelCount: hotels.length,
        hasFreeRooms: freeHotelsData.length > 0,
    });

    showToast('Скопировано в буфер обмена', 'success');
} catch (error) {
    // Подробное логирование
    console.error('Export failed:', {
        error,
        browserInfo: navigator.userAgent,
        isSecureContext: window.isSecureContext,
    });

    // Аналитика
    logEvent('export_hotels_error', {
        errorMessage: error.message,
        browser: getBrowserInfo(),
    });

    // Fallback
    if (!window.isSecureContext) {
        showToast('Копирование недоступно. Используйте HTTPS', 'error');
    } else {
        showToast('Не удалось скопировать. Попробуйте вручную', 'error');
    }
}
```

### 8. **Отсутствие offline support**

#### Проблема

При отсутствии интернета фича не работает, даже если данные уже загружены.

#### Почему плохо

- ❌ Плохой UX на нестабильном интернете
- ❌ Нет PWA возможностей
- ❌ Данные не персистятся

#### Решение

```typescript
// Вариант 1: Local Storage persistence
import { persist } from 'effector-storage/local';

export const $freeHotelsData = createStore<FreeHotelsDTO[]>([]);
persist({ store: $freeHotelsData, key: 'freeHotelsData' });

// Вариант 2: IndexedDB для больших объемов
import { persist } from 'effector-storage/indexed-db';

// Вариант 3: Service Worker для offline
// Кешировать данные и работать offline
```

## 🟡 Средние проблемы

### 9. **Жестко заданный формат**

#### Проблема

Формат экспорта зашит в коде, нет гибкости.

#### Решение

```typescript
// Шаблоны экспорта
const exportTemplates = {
    minimal: (hotel) => `${hotel.title}: ${hotel.telegram_url}`,
    detailed: (hotel) => `
        🏨 ${hotel.title}
        📍 ${hotel.address}
        📱 ${hotel.phone}
        💬 ${hotel.telegram_url}
    `,
    custom: (hotel, template) =>
        template.replace('{title}', hotel.title).replace('{telegram}', hotel.telegram_url),
    // ...
};
```

### 10. **Нет аналитики**

#### Проблема

Не знаем, как пользователи используют фичу.

#### Решение

```typescript
// Добавить events
const trackExport = (params: {
    hotelCount: number;
    hasFreeRooms: boolean;
    exportFormat: string;
}) => {
    // Google Analytics, Mixpanel, etc
    analytics.track('hotels_exported', params);
};
```

### 11. **Производительность форматирования**

#### Проблема

```typescript
// O(n * m) где n - hotels, m - freeHotelsData
const freeHotel = freeHotelsData?.find((fh) => fh.hotel_id === hotel.id);
```

#### Решение

```typescript
// Предвычислить Map - O(1) lookup
const freeHotelsMap = useMemo(() => {
    const map = new Map();
    freeHotelsData?.forEach((fh) => map.set(fh.hotel_id, fh));
    return map;
}, [freeHotelsData]);

// Использовать
const freeHotel = freeHotelsMap.get(hotel.id);
```

## 🟢 Рекомендованные улучшения

### A. Архитектура данных

```typescript
// ✅ Единый источник правды
interface SearchResultsState {
    // Нормализованные данные
    entities: {
        hotels: Record<string, HotelDTO>;
        rooms: Record<string, RoomDTO>;
        freeSlots: Record<string, FreeHotelsDTO>;
    };
    // IDs для порядка
    result: {
        hotelIds: string[];
        freeHotelIds: string[];
    };
    // Метаданные
    meta: {
        total: number;
        hasMore: boolean;
        lastUpdated: number;
    };
}
```

### B. Оптимизация запросов

```typescript
// ✅ Один запрос вместо двух
const useSearchHotels = (filters: TravelFilterType) => {
    return useQuery({
        queryKey: ['hotels', 'search', filters],
        queryFn: async () => {
            // Один endpoint возвращает все
            return await searchHotelsWithAvailability(filters);
        },
        // Кеширование
        staleTime: 5 * 60 * 1000, // 5 минут
        gcTime: 10 * 60 * 1000, // 10 минут
    });
};
```

### C. Мемоизация и кеширование

```typescript
// ✅ Кеширование форматированного текста
export const $exportText = combine($hotelsFilter, $freeHotelsData, (hotelsFilter, freeData) => {
    const hotels = hotelsFilter?.hotels || [];
    return formatHotelsWithAvailability(hotels, freeData);
});

// Использование в компоненте
const exportText = useUnit($exportText);
```

### D. Виртуализация списка

```typescript
// ✅ Для больших списков
import { useVirtualizer } from '@tanstack/react-virtual';

const ExportHotelsTable = ({ hotels }) => {
    const parentRef = useRef(null);

    const virtualizer = useVirtualizer({
        count: hotels.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 50,
    });

    return (
        <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
            <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map(item => (
                    <HotelRow
                        key={item.index}
                        hotel={hotels[item.index]}
                        style={{
                            height: `${item.size}px`,
                            transform: `translateY(${item.start}px)`
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
```

### E. Улучшенная типизация

```typescript
// ✅ Строгие типы для всех операций
import { z } from 'zod';

// Runtime валидация данных
const HotelSchema = z.object({
    id: z.string(),
    title: z.string(),
    telegram_url: z.string().url().optional(),
    phone: z.string().regex(/^\+7\(\d{3}\)\d{3}-\d{2}-\d{2}$/),
});

// Валидация при форматировании
export const formatHotelsWithValidation = (hotels: unknown[]) => {
    const validHotels = hotels
        .map((h) => HotelSchema.safeParse(h))
        .filter((result) => result.success)
        .map((result) => result.data);

    return formatHotels(validHotels);
};
```

### F. Персистентность и восстановление

```typescript
// ✅ Сохранение состояния
import { persist } from 'effector-storage/local';

// Автосохранение в localStorage
persist({
    store: $freeHotelsData,
    key: 'exportHotels_freeData',
    serialize: (data) => JSON.stringify(data),
    deserialize: (str) => JSON.parse(str),
});

// Восстановление при перезагрузке страницы
export const restoreExportData = createEvent();
$freeHotelsData.on(restoreExportData, () => {
    const saved = localStorage.getItem('exportHotels_freeData');
    return saved ? JSON.parse(saved) : [];
});
```

## 📊 Сравнение подходов

| Аспект          | Текущий      | Оптимальный    | Выигрыш |
| --------------- | ------------ | -------------- | ------- |
| Типизация       | Partial, any | Строгая        | 🟢🟢🟢  |
| Запросов к API  | 2            | 1              | 🟢🟢    |
| Memory usage    | Дублирование | Нормализация   | 🟢🟢🟢  |
| Скорость поиска | O(n)         | O(1)           | 🟢🟢🟢  |
| Рендеринг 1000+ | Медленно     | Виртуализация  | 🟢🟢🟢  |
| Offline support | ❌           | ✅ Persistence | 🟢🟢    |
| Аналитика       | ❌           | ✅ Events      | 🟢      |

## 🎯 План миграции (поэтапный)

### Этап 1: Базовая оптимизация (1-2 часа)

1. ✅ Исправить типы HotelForRoom
2. ✅ Добавить useMemo для форматирования
3. ✅ Создать derived stores вместо дублирования

### Этап 2: Архитектурные улучшения (3-5 часов)

4. Нормализовать данные
5. Объединить API запросы
6. Добавить persistence

### Этап 3: Масштабирование (5-8 часов)

7. Добавить виртуализацию
8. Реализовать chunked export для больших списков
9. Добавить worker для тяжелых операций

### Этап 4: Мониторинг и аналитика (2-3 часа)

10. Интегрировать аналитику
11. Добавить error tracking
12. Создать dashboard для метрик

## 💡 Быстрые победы (Quick Wins)

### 1. Исправить типы (5 минут)

```typescript
export type HotelForRoom = Pick<HotelDTO, 'id' | 'title' | 'telegram_url' | 'phone' | 'address'>;
```

### 2. Добавить useMemo (2 минуты)

```typescript
const formattedText = useMemo(
    () => formatHotelsWithAvailability(hotels, freeHotelsData),
    [hotels, freeHotelsData],
);
```

### 3. Убрать дублирование (10 минут)

```typescript
// Удалить freeHotels и freeHotels_id из $hotelsFilter
// Использовать только $freeHotelsData
```

### 4. Добавить предвычисленный Map (5 минут)

```typescript
const freeHotelsMap = useMemo(() => {
    const map = new Map();
    freeHotelsData?.forEach((fh) => map.set(fh.hotel_id, fh));
    return map;
}, [freeHotelsData]);
```

## 🚀 Идеальная архитектура

```typescript
// stores/searchResults.ts
export const $searchResults = createStore<NormalizedSearchResults>({
    entities: { hotels: {}, rooms: {}, freeSlots: {} },
    result: { hotelIds: [], freeHotelIds: [] },
    meta: { total: 0, lastUpdated: 0 }
});

// Селекторы
export const $hotelsList = $searchResults.map(
    state => state.result.hotelIds.map(id => state.entities.hotels[id])
);

export const $freeHotelsList = $searchResults.map(
    state => state.result.freeHotelIds.map(
        id => state.entities.freeSlots[id]
    )
);

export const $exportText = combine(
    $hotelsList,
    $freeHotelsList,
    formatHotelsWithAvailability
);

// Компонент
export const ExportHotelsButton = () => {
    const exportText = useUnit($exportText);
    const hotels = useUnit($hotelsList);

    return (
        <Button onClick={() => copyToClipboard(exportText)}>
            Экспорт ({hotels.length})
        </Button>
    );
};
```

## 📈 Метрики для отслеживания

1. **Производительность**

    - Время форматирования текста
    - Время копирования
    - Время рендера таблицы

2. **Использование**

    - Количество экспортов
    - Средний размер экспорта
    - Самые популярные отели

3. **Ошибки**
    - Rate копирования (успех/ошибка)
    - Типы браузеров с ошибками
    - Самые частые причины ошибок

## 🎓 Выводы

### Что делать в первую очередь:

1. **Исправить типы** - убрать `as any`
2. **Добавить мемоизацию** - ускорить рендер
3. **Убрать дублирование** - упростить синхронизацию

### Что делать потом:

4. Нормализовать данные
5. Объединить API запросы
6. Добавить виртуализацию

### Что можно отложить:

7. Offline support
8. Advanced analytics
9. Worker threads

---

**Итог:** Текущий подход рабочий, но имеет проблемы масштабируемости и типизации. Рекомендуется поэтапная миграция.
