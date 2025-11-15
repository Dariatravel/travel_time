# Архитектура ExportHotels

## 📐 Текущая архитектура

### Схема потока данных

```
┌─────────────────┐
│   SearchForm    │
│   (UI Layer)    │
└────────┬────────┘
         │
         │ 1. User submits search
         ▼
┌─────────────────────────┐
│  getHotelsWithFreeRooms │ ◄─── API запрос к Supabase
│     (API Layer)         │
└────────┬────────────────┘
         │
         │ 2. Получаем FreeHotelsDTO[]
         ▼
┌─────────────────────────┐
│  setFreeHotelsData()    │ ◄─── Event в Effector
└────────┬────────────────┘
         │
         │ 3. Обновляем stores
         ▼
┌──────────────────────────────────────┐
│         Effector Stores              │
│ ┌──────────────────────────────────┐ │
│ │  $freeHotelsData                 │ │
│ │  FreeHotelsDTO[]                 │ │
│ └──────┬───────────────────────────┘ │
│        │                              │
│        ├─► $freeHotelsMap            │ ◄─── Derived
│        │   Map<hotel_id, FreeHotel>  │      (O(1) lookup)
│        │                              │
│        ├─► $freeHotelIds             │ ◄─── Derived
│        │   string[]                  │      (массив ID)
│        │                              │
│        ├─► $totalFreeRooms           │ ◄─── Derived
│        │   number                    │      (сумма)
│        │                              │
│        └─► $hasFreeRooms             │ ◄─── Derived
│            boolean                   │      (проверка)
└──────────────────────────────────────┘
         │
         │ 4. Подписка на изменения
         ▼
┌─────────────────────────┐
│  ExportHotelsButton     │ ◄─── useUnit($hotelsFilter)
│  (UI Component)         │      useUnit($freeHotelsData)
└────────┬────────────────┘
         │
         │ 5. User clicks button
         ▼
┌─────────────────────────┐
│  ExportHotelsModal      │
│  (Modal Component)      │
│                         │
│  ┌───────────────────┐  │
│  │ useMemo:          │  │
│  │ - formattedText   │  │ ◄─── Мемоизация
│  │ - freeHotelsMap   │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │ useEffect:        │  │
│  │ - auto copy       │  │ ◄─── Автокопирование
│  └───────────────────┘  │
└────────┬────────────────┘
         │
         │ 6. Format & Copy
         ▼
┌─────────────────────────┐
│  formatHotelsWithAvail  │ ◄─── Форматирование
│  (Utility Function)     │
└────────┬────────────────┘
         │
         │ 7. Copy to clipboard
         ▼
┌─────────────────────────┐
│  copyToClipboard()      │ ◄─── Clipboard API
│  + fallback             │      с fallback
└─────────────────────────┘
```

## 🗂️ Структура файлов

```
src/
├── features/
│   └── ExportHotels/
│       ├── ui/
│       │   ├── ExportHotelsButton.tsx     ← Кнопка (подписка на stores)
│       │   └── ExportHotelsModal.tsx      ← Модалка (форматирование + копирование)
│       ├── lib/
│       │   ├── formatHotels.ts            ← Базовое форматирование
│       │   └── formatHotelsWithAvailability.ts  ← Форматирование + свободные номера
│       └── index.ts                       ← Публичное API
│
└── shared/
    └── models/
        ├── hotels.ts                      ← Store фильтров (устарел частично)
        └── freeHotels.ts                  ← Новый store для свободных номеров
```

## 🔄 Жизненный цикл данных

### 1. Инициализация

```typescript
// При загрузке приложения
$hotelsFilter: null;
$freeHotelsData: [];
```

### 2. Поиск отелей

```typescript
// User вводит фильтры и нажимает "Найти"
SearchForm.onSearch() →
    getHotelsWithFreeRooms(filters) →
    setFreeHotelsData(result) →
    changeTravelFilter(filter)

// Результат:
$hotelsFilter: { hotels: [...], ... }
$freeHotelsData: [{ hotel_id, rooms, ... }]
```

### 3. Открытие модалки экспорта

```typescript
// User нажимает на ExportHotelsButton
ExportHotelsButton.onClick() →
    setIsModalOpen(true) →
    ExportHotelsModal.mount()

// В модалке:
hotels = useUnit($hotelsFilter).hotels
freeData = useUnit($freeHotelsData)

formattedText = useMemo(() =>
    formatHotelsWithAvailability(hotels, freeData)
)

useEffect(() => {
    if (isOpen) copyToClipboard(formattedText)
})
```

### 4. Очистка фильтров

```typescript
// При сбросе поиска
clearFreeHotelsData() →
    $freeHotelsData: []
```

## 🏗️ Идеальная архитектура (будущее)

### Схема оптимизированного потока

```
┌─────────────────┐
│   SearchForm    │
└────────┬────────┘
         │
         ▼
┌────────────────────────────┐
│  Unified Search API        │ ◄─── ОДИН запрос
│  (Backend)                 │
└────────┬───────────────────┘
         │
         │ { hotels, availability, meta }
         ▼
┌────────────────────────────┐
│  setSearchResults()        │ ◄─── ОДИН event
└────────┬───────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  $normalizedSearchResults            │ ◄─── ОДИН store
│                                      │
│  {                                   │
│    entities: {                       │
│      hotels: Record<id, HotelDTO>   │ ◄─── Нормализация
│      freeSlots: Record<id, Free...> │
│    },                                │
│    result: {                         │
│      hotelIds: string[]              │ ◄─── Порядок
│      filterIds: string[]             │
│    }                                 │
│  }                                   │
└────────┬─────────────────────────────┘
         │
         ├─► $hotelsList (derived)
         ├─► $freeHotelsMap (derived)
         ├─► $exportText (derived)  ◄─── Предвычисленный текст!
         └─► $availabilityStats (derived)
         │
         ▼
┌─────────────────────────┐
│  ExportHotelsButton     │ ◄─── Просто читает $exportText
└─────────────────────────┘
         │
         ▼ Click
┌─────────────────────────┐
│  copyToClipboard()      │ ◄─── Мгновенное копирование
└─────────────────────────┘
```

### Преимущества:

- ✅ Один API запрос вместо двух
- ✅ Нет дублирования данных
- ✅ O(1) поиск любого отеля
- ✅ Предвычисленный текст экспорта
- ✅ Мгновенное копирование

## 🔀 Альтернативные подходы

### Подход 1: Server-side экспорт

```typescript
// Backend генерирует файл
POST /api/hotels/export
Response: { downloadUrl: '...' }

// Frontend просто скачивает
<a href={downloadUrl} download>Скачать список</a>
```

**Плюсы:**

- Нет ограничений browser clipboard
- Можно экспортировать в любой формат (PDF, Excel)
- Быстрее для больших списков

**Минусы:**

- Дополнительный запрос
- Нужен backend endpoint
- Задержка на генерацию

### Подход 2: WebWorker для форматирования

```typescript
// worker.ts
self.onmessage = (e) => {
    const { hotels, freeData } = e.data;
    const formatted = formatHotelsWithAvailability(hotels, freeData);
    self.postMessage(formatted);
};

// В компоненте
const worker = new Worker('worker.js');
worker.postMessage({ hotels, freeData });
worker.onmessage = (e) => {
    setFormattedText(e.data);
};
```

**Плюсы:**

- Не блокирует UI thread
- Быстрее для больших списков

**Минусы:**

- Сложнее в разработке
- Overhead для маленьких списков

### Подход 3: Streaming export

```typescript
// Для очень больших списков (10000+)
const exportAsStream = async function* (hotels) {
    for (let i = 0; i < hotels.length; i += 100) {
        const chunk = hotels.slice(i, i + 100);
        yield formatChunk(chunk);
    }
};

// Постепенное копирование
for await (const chunk of exportAsStream(hotels)) {
    appendToClipboard(chunk);
}
```

## 🎯 Рекомендация

**Для текущего масштаба проекта (< 1000 отелей):**

1. ✅ Использовать текущую архитектуру с оптимизациями
2. ✅ Убрать дублирование данных
3. ✅ Добавить persistence
4. ⏳ Виртуализацию добавить, когда будет > 500 отелей

**Для масштабирования (> 1000 отелей):**

1. Добавить виртуализацию
2. Объединить API запросы
3. Рассмотреть server-side экспорт

**Для enterprise (> 10000 отелей):**

1. WebWorkers
2. Streaming export
3. CDN для статических данных
4. GraphQL подписки для real-time обновлений
