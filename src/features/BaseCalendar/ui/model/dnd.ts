// stores.ts
import { createEvent, createStore } from 'effector';

// Типы
export type InsertPosition = {
    beforeId: string | null;
    afterId: string | null;
};

// Создание хранилищ
export const $activeId = createStore<string | null>(null);
export const $insertPosition = createStore<InsertPosition>({
    beforeId: null,
    afterId: null,
});

// Создание событий
export const dragStarted = createEvent<string>(); // id элемента
export const positionChanged = createEvent<InsertPosition>();
export const dragEnded = createEvent();
export const dragCancelled = createEvent();

// Обработка событий для activeId
$activeId
    .on(dragStarted, (_, id) => id)
    .reset(dragEnded)
    .reset(dragCancelled);

// Обработка событий для insertPosition
$insertPosition
    .on(positionChanged, (_, position) => position)
    .reset(dragEnded)
    .reset(dragCancelled);
