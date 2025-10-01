'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getValueLabel } from '@/features/AdvancedFilters/lib/constants';
import { HotelRoomsDTO, useDeleteHotel } from '@/shared/api/hotel/hotel';
import { QUERY_KEYS, queryClient } from '@/shared/config/reactQuery';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { TravelButton } from '@/shared/ui/Button/Button';
import { showToast } from '@/shared/ui/Toast/Toast';
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import cx from 'classnames';
import { Bed, Building2, Edit, HouseIcon, MapPin, Phone, Search, Star, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

/**
 * Функция для определения правильного окончания слова "номер" в зависимости от количества
 * @param count - количество номеров
 * @returns строка с правильным окончанием
 */
const getRoomDeclension = (count: number): string => {
    if (count === 0) return 'номеров';

    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    // Исключения для чисел от 11 до 19
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
        return 'номеров';
    }

    // Правила для последней цифры
    if (lastDigit === 1) return 'номер';
    if (lastDigit >= 2 && lastDigit <= 4) return 'номера';
    return 'номеров';
};

/**
 * Функция для получения строки с количеством номеров и правильным окончанием
 * @param count - количество номеров
 * @returns строка вида "5 номеров"
 */
const getRoomsCountText = (count: number): string => {
    return `${count} ${getRoomDeclension(count)}`;
};

/**
 * Интерфейс пропсов для компонента HotelsTable
 */
export interface HotelsTableProps {
    /** Массив отелей для отображения в таблице */
    hotels: HotelRoomsDTO[];
    /** Обработчик редактирования отеля */
    onEdit: (hotel: HotelRoomsDTO) => void;
    /** Состояние загрузки */
    isLoading?: boolean;
    /** Обработчик добавления нового отеля */
    onAddHotel?: () => void;
    /** Обработчик перехода к номерам отеля */
    onViewRooms?: (hotel: HotelRoomsDTO) => void;
}

/**
 * Рендер звезд рейтинга
 */
const renderRating = (rating: number) => {
    return (
        <div className="flex items-center gap-1">
            {[...Array(5)].map((_, index) => (
                <Star
                    key={index}
                    className={cx('w-4 h-4', {
                        'text-yellow-400 fill-current': index < rating,
                        'text-gray-300': index >= rating,
                    })}
                />
            ))}
            <span className="ml-1 text-sm text-gray-600">{rating}</span>
        </div>
    );
};

/**
 * Мобильная карточка отеля
 */
const MobileHotelCard: React.FC<{
    hotel: HotelRoomsDTO;
    onEdit: (hotel: HotelRoomsDTO) => void;
    onDelete: (id: string, title: string) => void;
    onViewRooms?: (hotel: HotelRoomsDTO) => void;
    isDeleting: boolean;
}> = ({ hotel, onEdit, onDelete, onViewRooms, isDeleting }) => {
    const getRoomsCount = (hotel: HotelRoomsDTO): string => {
        const count = hotel.rooms?.length || 0;
        return `${getRoomsCountText(count)}`;
    };
    return (
        <Card className="mb-4">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <CardTitle className="text-lg leading-tight">{hotel.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                                {hotel.type}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {getValueLabel(hotel.city)}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        {onViewRooms && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewRooms(hotel)}
                                className="h-8 w-8 p-0"
                                title="Просмотреть номера"
                            >
                                <Bed className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(hotel)}
                            className="h-8 w-8 p-0"
                            title="Редактировать отель"
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="space-y-3">
                    {/* Адрес */}
                    <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-muted-foreground leading-relaxed">
                            <Badge variant="outline">{hotel.address}</Badge>
                        </span>
                    </div>

                    {/* Телефон */}
                    <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="outline">{hotel.phone}</Badge>
                    </div>
                    {/* Всего номеров */}
                    <div className="space-y-2 flex items-center gap-1">
                        <HouseIcon className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="outline"> {getRoomsCount(hotel)}</Badge>
                    </div>
                    {/* Особенности */}
                    {hotel.features && hotel.features.length > 0 && (
                        <div className="space-y-2">
                            <span className="text-sm font-medium text-muted-foreground">
                                Особенности:
                            </span>
                            <div className="flex flex-wrap gap-1">
                                {hotel.features.map((feature, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                        {getValueLabel(feature)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

/**
 * Компонент таблицы отелей с функциональностью фильтрации, пагинации и управления на базе TanStack Table
 */
export const HotelsTable: React.FC<HotelsTableProps> = ({
    hotels,
    onEdit,
    isLoading = false,
    onAddHotel,
    onViewRooms,
}) => {
    const [globalFilter, setGlobalFilter] = useState('');
    const { isMobile } = useScreenSize();

    // Хук для удаления отеля
    const { isPending: isDeleting, mutateAsync: deleteHotel } = useDeleteHotel(() => {
        queryClient.invalidateQueries({
            queryKey: [...QUERY_KEYS.hotels],
        });
        showToast('Отель успешно удален', 'success');
    });

    /**
     * Обработчик удаления отеля
     */
    const handleDelete = async (hotelId: string, hotelTitle: string) => {
        if (window.confirm(`Вы уверены, что хотите удалить отель "${hotelTitle}"?`)) {
            try {
                await deleteHotel(hotelId);
            } catch (error) {
                showToast('Ошибка при удалении отеля', 'error');
                console.error('Error deleting hotel:', error);
            }
        }
    };

    /**
     * Определение колонок таблицы
     */
    const columns: ColumnDef<HotelRoomsDTO>[] = useMemo(
        () => [
            {
                accessorKey: 'title',
                size: 300,
                enableResizing: true,
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="flex items-center gap-1 h-auto p-0"
                    >
                        <Building2 className="w-4 h-4" />
                        Название
                        {column.getIsSorted() === 'asc' && <span>↑</span>}
                        {column.getIsSorted() === 'desc' && <span>↓</span>}
                    </Button>
                ),

                cell: ({ row }) => (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className=" truncate font-medium cursor-help">
                                    {row.getValue('title')}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs">{row.getValue('title')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ),
            },
            {
                accessorKey: 'city',
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="flex items-center gap-1 h-auto p-0"
                    >
                        <MapPin className="w-4 h-4" />
                        Город
                        {column.getIsSorted() === 'asc' && <span className="ml-1">↑</span>}
                        {column.getIsSorted() === 'desc' && <span className="ml-1">↓</span>}
                    </Button>
                ),
                cell: ({ row }) => <div>{getValueLabel(row.getValue('city'))}</div>,
            },
            {
                accessorKey: 'type',
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-auto p-0"
                    >
                        Тип
                        {column.getIsSorted() === 'asc' && <span className="ml-1">↑</span>}
                        {column.getIsSorted() === 'desc' && <span className="ml-1">↓</span>}
                    </Button>
                ),
                cell: ({ row }) => <Badge variant="secondary">{row.getValue('type')}</Badge>,
            },

            {
                accessorKey: 'address',
                header: 'Адрес',
                cell: ({ row }) => (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="max-w-[200px] truncate cursor-help">
                                    {row.getValue('address')}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-xs">{row.getValue('address')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ),
            },
            {
                accessorKey: 'phone',
                header: () => (
                    <div className="flex items-center gap-1 min-w-[125px] max-w-[125px]">
                        <Phone className="w-4 h-4" />
                        Телефон
                    </div>
                ),
                cell: ({ row }) => <div>{row.getValue('phone')}</div>,
            },
            {
                id: 'rooms',
                header: 'Номера',
                cell: ({ row }) => (
                    <Badge variant="outline">
                        {getRoomsCountText(row.original.rooms?.length || 0)}
                    </Badge>
                ),
            },
            {
                id: 'features',
                header: 'Особенности',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {row.original.features?.slice(0, 2).map((feature, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                                {getValueLabel(feature)}
                            </Badge>
                        ))}
                        {row.original.features?.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                                +{row.original.features.length - 2}
                            </Badge>
                        )}
                    </div>
                ),
            },
            {
                id: 'eat',
                header: 'Питание',
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {row.original.eat?.slice(0, 2).map((eat, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                                {getValueLabel(eat)}
                            </Badge>
                        ))}
                        {row.original.features?.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                                +{row.original.features.length - 2}
                            </Badge>
                        )}
                    </div>
                ),
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Действия</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        {onViewRooms && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewRooms(row.original)}
                                className="h-8 w-8 p-0"
                                title="Просмотреть номера"
                            >
                                <Bed className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(row.original)}
                            className="h-8 w-8 p-0"
                            title="Редактировать отель"
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            },
        ],
        [onEdit, onViewRooms, handleDelete, isDeleting],
    );

    /**
     * Конфигурация таблицы TanStack
     */
    const table = useReactTable({
        data: hotels,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            globalFilter,
        },
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn: (row, columnId, filterValue) => {
            const hotel = row.original;
            const searchValue = filterValue.toLowerCase();
            return (
                hotel?.title?.toLowerCase().includes(searchValue) ||
                hotel?.city?.toLowerCase().includes(searchValue) ||
                hotel?.address?.toLowerCase().includes(searchValue) ||
                hotel?.type?.toLowerCase().includes(searchValue)
            );
        },
        initialState: {
            pagination: {
                pageSize: 10,
            },
        },
    });

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Загрузка отелей...</CardTitle>
                </CardHeader>
                <CardContent className="min-h-[500px]">
                    <div className="animate-pulse space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-none border-none bg-transparent lg:bg-card">
            <CardHeader className="pb-4 pt-0 lg:pb-4 lg:pt-2 shadow-md border-md rounded-md lg:shadow-none lg:border-none lg:rounded-none">
                <div
                    className={cx(
                        'flex items-center gap-4',
                        isMobile ? 'flex-col' : 'justify-between',
                    )}
                >
                    <CardTitle
                        className={cx('font-bold', isMobile ? 'text-xl text-center' : 'text-2xl')}
                    >
                        Все отели
                    </CardTitle>
                    {onAddHotel && (
                        <TravelButton
                            label="Добавить отель"
                            onClick={onAddHotel}
                            className={isMobile ? 'w-full' : ''}
                        />
                    )}
                </div>

                {/* Поиск */}
                <div className={cx('relative', isMobile ? 'w-full' : 'max-w-md')}>
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder={
                            isMobile ? 'Поиск...' : 'Поиск по названию, городу, адресу или типу...'
                        }
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-10 pr-10"
                    />
                    {globalFilter && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setGlobalFilter('')}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="min-h-[65vh] p-0">
                {/* Мобильная версия - карточки */}
                {isMobile ? (
                    <div className="space-y-0">
                        {table.getRowModel().rows?.length ? (
                            table
                                .getRowModel()
                                .rows.map((row) => (
                                    <MobileHotelCard
                                        key={row.id}
                                        hotel={row.original}
                                        onEdit={onEdit}
                                        onDelete={handleDelete}
                                        onViewRooms={onViewRooms}
                                        isDeleting={isDeleting}
                                    />
                                ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                {globalFilter ? 'Отели не найдены' : 'Отели отсутствуют'}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Десктопная версия - таблица */
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead key={header.id}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                          header.column.columnDef.header,
                                                          header.getContext(),
                                                      )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {table.getRowModel().rows?.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && 'selected'}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell key={cell.id}>
                                                    {flexRender(
                                                        cell.column.columnDef.cell,
                                                        cell.getContext(),
                                                    )}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            colSpan={columns.length}
                                            className="h-24 text-center text-muted-foreground"
                                        >
                                            {globalFilter
                                                ? 'Отели не найдены по заданному критерию поиска'
                                                : 'Отели отсутствуют'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-0">
                {/* Пагинация */}
                {isMobile ? (
                    /* Мобильная пагинация */
                    <div className="flex flex-col py-4 px-2 space-y-0 shadow-md rounded-md border w-full bg-background">
                        <div className="flex items-center justify-center space-x-2">
                            <p className="text-sm text-muted-foreground">
                                Страница {table.getState().pagination.pageIndex + 1} из{' '}
                                {table.getPageCount()}
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                                className="flex-1 max-w-[120px]"
                            >
                                Назад
                            </Button>

                            <div className="flex items-center space-x-1">
                                <span className="text-xs text-muted-foreground">Строк:</span>
                                <select
                                    value={table.getState().pagination.pageSize}
                                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                                    className="h-8 w-[60px] rounded border border-input bg-background px-2 py-1 text-xs"
                                >
                                    {[5, 10, 20].map((pageSize) => (
                                        <option key={pageSize} value={pageSize}>
                                            {pageSize}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                                className="flex-1 max-w-[120px]"
                            >
                                Вперед
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Десктопная пагинация */
                    <div className="flex items-center justify-between p-4 w-full">
                        <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium">Строк на странице</p>
                            <select
                                value={table.getState().pagination.pageSize}
                                onChange={(e) => {
                                    table.setPageSize(Number(e.target.value));
                                }}
                                className="h-8 w-[70px] rounded border border-input bg-background px-3 py-1 text-sm"
                            >
                                {[5, 10, 20, 30, 50].map((pageSize) => (
                                    <option key={pageSize} value={pageSize}>
                                        {pageSize}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center space-x-6 lg:space-x-8">
                            <div className="flex items-center space-x-2">
                                {table.getPageCount() > 1 && <></>}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.setPageIndex(0)}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    Первая
                                </Button>
                                <div className="flex items-center space-x-1">
                                    {Array.from(
                                        { length: Math.min(5, table.getPageCount()) },
                                        (_, i) => {
                                            const pageIndex = i;
                                            return (
                                                <Button
                                                    key={pageIndex}
                                                    variant={
                                                        table.getState().pagination.pageIndex ===
                                                        pageIndex
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size="sm"
                                                    onClick={() => table.setPageIndex(pageIndex)}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    {pageIndex + 1}
                                                </Button>
                                            );
                                        },
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                                    disabled={!table.getCanNextPage()}
                                >
                                    Последняя
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
};
