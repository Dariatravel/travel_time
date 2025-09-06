'use client';
import React from 'react';
import { AdvancedFilters, AdvancedFiltersState } from '../index';

/**
 * Демо-компонент для тестирования AdvancedFilters
 * Показывает, как использовать компонент и выводит выбранные фильтры
 */
export const AdvancedFiltersDemo: React.FC = () => {
    const handleFiltersChange = (filters: AdvancedFiltersState) => {
        console.log('Выбранные фильтры:', filters);

        // Подсчитываем активные фильтры
        let totalActive = 0;
        (Object.values(filters) as Array<AdvancedFiltersState[keyof AdvancedFiltersState]>).forEach(
            (section) => {
                totalActive += section.options.filter((option) => option.isActive).length;
            },
        );

        alert(`Применено фильтров: ${totalActive}`);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-4">
                    Демо расширенных фильтров
                </h1>
                <p className="text-muted-foreground">
                    Компонент для расширенной фильтрации при поиске номеров отелей. Нажмите на
                    кнопку "Фильтры" чтобы открыть модальное окно с фильтрами.
                </p>
            </div>

            <div className="space-y-6">
                <div className="p-6 border rounded-lg bg-card">
                    <h2 className="text-xl font-semibold mb-4">Фильтры по отелю</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                        Фильтрация по городу, типу пляжа, расстоянию до пляжа и наличию
                        кафе/ресторана.
                    </p>
                    <AdvancedFilters
                        title="Фильтры по отелю"
                        triggerText="Фильтры отеля"
                        onFiltersChange={handleFiltersChange}
                    />
                </div>
            </div>

            <div className="mt-8 p-6 border rounded-lg bg-muted/50">
                <h3 className="text-lg font-semibold mb-3">Инструкция по использованию:</h3>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Нажмите на любую кнопку "Фильтры" для открытия модального окна</li>
                    <li>Раскройте нужные секции фильтров, нажав на заголовки</li>
                    <li>Выберите нужные опции, нажав на теги</li>
                    <li>Активные фильтры отмечены цветом и имеют крестик для удаления</li>
                    <li>Используйте кнопку "Сбросить фильтры" для очистки всех выборов</li>
                    <li>Нажмите "Применить фильтры" для сохранения выбора</li>
                </ul>
            </div>
        </div>
    );
};
