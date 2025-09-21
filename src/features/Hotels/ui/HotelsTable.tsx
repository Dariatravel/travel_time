'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Building2, Edit, MapPin, Phone, Search, Star, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';

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
    isDeleting: boolean;
}> = ({ hotel, onEdit, onDelete, isDeleting }) => {
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
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(hotel)}
                            className="h-8 w-8 p-0"
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(hotel.id, hotel.title)}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                            <Trash2 className="h-4 w-4" />
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
                            {hotel.address}
                        </span>
                    </div>

                    {/* Телефон */}
                    <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{hotel.phone}</span>
                    </div>

                    {/* Рейтинг и номера */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-muted-foreground" />
                            {renderRating(hotel.rating)}
                        </div>
                        <Badge variant="outline">{hotel.rooms?.length || 0} номеров</Badge>
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
                                <div className="max-w-[200px] truncate font-medium cursor-help">
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
                    <div className="flex items-center gap-1">
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
                    <Badge variant="outline">{row.original.rooms?.length || 0} номеров</Badge>
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
                id: 'actions',
                header: () => <div className="text-right">Действия</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
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
        [onEdit, handleDelete, isDeleting],
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
                hotel.title.toLowerCase().includes(searchValue) ||
                hotel.city.toLowerCase().includes(searchValue) ||
                hotel.address.toLowerCase().includes(searchValue) ||
                hotel.type.toLowerCase().includes(searchValue)
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
                <CardContent>
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
        <Card>
            <CardHeader className="pb-4">
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
                        className="pl-10"
                    />
                </div>
            </CardHeader>

            <CardContent>
                {/* Мобильная версия - карточки */}
                {isMobile ? (
                    <div className="space-y-4">
                        {table.getRowModel().rows?.length ? (
                            table
                                .getRowModel()
                                .rows.map((row) => (
                                    <MobileHotelCard
                                        key={row.id}
                                        hotel={row.original}
                                        onEdit={onEdit}
                                        onDelete={handleDelete}
                                        isDeleting={isDeleting}
                                    />
                                ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                {globalFilter
                                    ? 'Отели не найдены по заданному критерию поиска'
                                    : 'Отели отсутствуют'}
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

                {/* Пагинация */}
                {isMobile ? (
                    /* Мобильная пагинация */
                    <div className="flex flex-col space-y-4 py-4">
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
                    <div className="flex items-center justify-between space-x-2 py-4">
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
                            <div className="flex w-[120px] items-center justify-center text-sm font-medium">
                                Страница {table.getState().pagination.pageIndex + 1} из{' '}
                                {table.getPageCount()}
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.setPageIndex(0)}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    Первая
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    Предыдущая
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                >
                                    Следующая
                                </Button>
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
            </CardContent>
        </Card>
    );
};
