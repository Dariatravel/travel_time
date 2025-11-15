# TravelDialog

Универсальный компонент модального окна для приложения Travel Time.

## Особенности

- **Адаптивность**: Автоматически переключается между полноэкранным режимом на мобильных устройствах и стандартным на десктопе
- **Гибкость**: Поддержка кастомных классов для настройки внешнего вида
- **Консистентность**: Единый стиль для всех модальных окон в приложении
- **Два API**: Поддержка как нового декларативного API (title/description/footer), так и старого (children) для обратной совместимости

## Использование

### Новый API (рекомендуется)

```tsx
import { TravelDialog } from '@/shared';
import { FormTitle } from '@/components/ui/form-title';
import { Button } from '@/components/ui/button';

<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
  contentClassName="sm:max-w-4xl" // опционально, для изменения ширины на десктопе
  title={<FormTitle>Заголовок модального окна</FormTitle>}
  description={
    <div>
      {/* Прокручиваемый контент */}
    </div>
  }
  footer={
    <>
      <Button variant="outline" onClick={onClose}>Отмена</Button>
      <Button onClick={handleSubmit}>Сохранить</Button>
    </>
  }
  // Опциональные классы для кастомизации
  headerClassName="custom-header"
  descriptionClassName="custom-description"
  footerClassName="custom-footer"
/>
```

### Старый API (для обратной совместимости)

```tsx
import { TravelDialog } from '@/shared';
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
>
  <DialogHeader className="shrink-0 px-4 pt-4 sm:px-0 sm:pt-0">
    <DialogTitle>Заголовок</DialogTitle>
  </DialogHeader>

  <DialogDescription className="flex-1 overflow-y-auto px-4 sm:px-0">
    {/* Прокручиваемый контент */}
  </DialogDescription>

  <DialogFooter className="flex shrink-0 flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end sm:border-none sm:px-0 sm:py-0 sm:pt-4">
    {/* Кнопки действий */}
  </DialogFooter>
</TravelDialog>
```

## Props

### Основные
- `isOpen` (boolean, required) - состояние открытия модального окна
- `onClose` (function, required) - обработчик закрытия

### Новый API
- `title` (ReactNode, optional) - заголовок модального окна (автоматически оборачивается в DialogHeader + DialogTitle)
- `description` (ReactNode, optional) - основное содержимое (автоматически оборачивается в DialogDescription с прокруткой)
- `footer` (ReactNode, optional) - футер с кнопками (автоматически оборачивается в DialogFooter)

### Старый API
- `children` (ReactNode, optional) - содержимое модального окна (используется если не указаны title/description/footer)

### Стилизация
- `className` (string, optional) - дополнительные классы для обёртки Dialog
- `contentClassName` (string, optional) - дополнительные классы для DialogContent
- `headerClassName` (string, optional) - дополнительные классы для DialogHeader
- `descriptionClassName` (string, optional) - дополнительные классы для DialogDescription
- `footerClassName` (string, optional) - дополнительные классы для DialogFooter

## Стили по умолчанию

### Мобильные устройства (< 640px)
- Полноэкранный режим: `h-[100vh] w-[100vw]`
- Без скругления углов: `rounded-none`
- Без отступов: `p-0`

### Десктоп (≥ 640px)
- Автоматическая высота: `h-auto`
- Максимальная высота: `max-h-[90vh]`
- Ширина по умолчанию: `max-w-2xl` (можно переопределить через `contentClassName`)
- Скругление углов: `rounded-xl`
- Отступы: `p-6`

## Рекомендуемая структура

1. **DialogHeader** - заголовок модального окна (фиксированный)
2. **DialogDescription** или контент - прокручиваемая область
3. **DialogFooter** - кнопки действий (фиксированные внизу на мобильных)

## Примеры использования

### HotelModal
```tsx
<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
  title={<FormTitle>Редактирование отеля</FormTitle>}
  description={<HotelInfo {...props} />}
/>
```

### RoomModal (с увеличенной шириной)
```tsx
<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
  contentClassName="sm:max-w-4xl"
  title={<FormTitle>Добавление номера</FormTitle>}
  description={<RoomInfo {...props} />}
  descriptionClassName="sm:px-1"
/>
```

### AdvancedFilters (с кнопками внизу)
```tsx
<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
  contentClassName="sm:max-w-4xl"
  title={<span className="text-lg font-semibold">Расширенные фильтры</span>}
  description={
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Фильтры */}
    </div>
  }
  descriptionClassName="pr-1 sm:pr-2"
  footer={
    <>
      <Button variant="outline">Сбросить</Button>
      <Button>Применить</Button>
    </>
  }
/>
```

### ExportHotelsModal (с полным набором элементов)
```tsx
<TravelDialog
  isOpen={isOpen}
  onClose={onClose}
  contentClassName="sm:max-w-4xl"
  title="Экспорт списка отелей"
  description={
    <>
      <p className="mb-4 text-sm text-muted-foreground">Описание</p>
      <div>{/* Контент */}</div>
    </>
  }
  footer={
    <>
      <Button variant="outline" onClick={onClose}>Закрыть</Button>
      <Button onClick={handleCopy}>Копировать</Button>
    </>
  }
/>
```
