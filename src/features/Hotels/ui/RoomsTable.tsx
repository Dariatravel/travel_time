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
import { VALUE_TO_LABEL_MAP } from '@/features/AdvancedFilters/lib/constants';
import { RoomDTO, useDeleteRoom } from '@/shared/api/room/room';
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
import { Bed, Edit, Search, Trash2, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

/**
 * Интерфейс пропсов для компонента RoomsTable
 */
export interface RoomsTableProps {
    /** Массив номеров для отображения в таблице */
    rooms: RoomDTO[];
    /** Обработчик редактирования номера */
    onEdit: (room: RoomDTO) => void;
    /** Состояние загрузки */
    isLoading?: boolean;
    /** Обработчик добавления нового номера */
    onAddRoom?: () => void;
    /** ID отеля для инвалидации кеша */
    hotelId?: string;
}

/**
 * Мобильная карточка номера
 */
const MobileRoomCard: React.FC<{
    room: RoomDTO;
    onEdit: (room: RoomDTO) => void;
    onDelete: (id: string, title: string) => void;
    isDeleting: boolean;
}> = ({ room, onEdit, onDelete, isDeleting }) => {
    return (
        <Card className="mb-4 ">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <CardTitle className="text-lg leading-tight">{room.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                                {room.quantity} мест
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {room.price} ₽/сутки
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEdit(room)}
                            className="h-8 w-8 p-0"
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDelete(room.id, room.title)}
                            disabled={isDeleting}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="space-y-2">
                    {room.comment && (
                        <p className="text-sm text-muted-foreground">{room.comment}</p>
                    )}
                    {room.room_features && room.room_features.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {room.room_features.map((feature) => (
                                <Badge key={feature} variant="outline" className="text-xs">
                                    {feature}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

/**
 * Компонент таблицы номеров отеля
 */
export const RoomsTable: React.FC<RoomsTableProps> = ({
    rooms,
    onEdit,
    isLoading = false,
    onAddRoom,
    hotelId,
}) => {
    const [globalFilter, setGlobalFilter] = useState('');
    const { isMobile } = useScreenSize();

    // Хук для удаления номера
    const { isPending: isDeleting, mutateAsync: deleteRoom } = useDeleteRoom(
        hotelId, // hotelId
        () => {
            if (hotelId) {
                queryClient.invalidateQueries({
                    queryKey: [...QUERY_KEYS.roomsByHotel, hotelId],
                });
            }
            showToast('Номер успешно удален', 'success');
        },
    );

    const handleDelete = useCallback(
        async (id: string, title: string) => {
            if (window.confirm(`Вы уверены, что хотите удалить номер "${title}"?`)) {
                try {
                    await deleteRoom(id);
                } catch {
                    showToast('Ошибка при удалении номера', 'error');
                }
            }
        },
        [deleteRoom],
    );

    const getFeatureLabel = (feature: string) => {
        return VALUE_TO_LABEL_MAP[feature as keyof typeof VALUE_TO_LABEL_MAP];
    };
    // Определение колонок таблицы
    const columns = useMemo<ColumnDef<RoomDTO>[]>(
        () => [
            {
                accessorKey: 'title',
                header: 'Название',
                size: 200,
                minSize: 180,
                maxSize: 220,
                cell: ({ row }) => {
                    const room = row.original;
                    return (
                        <div className="flex items-center gap-2">
                            <Bed className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{room.title}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'quantity',
                header: 'Вместимость',
                cell: ({ row }) => {
                    const quantity = row.getValue('quantity') as number;
                    return (
                        <Badge variant="secondary" className="text-xs">
                            {quantity} мест
                        </Badge>
                    );
                },
                size: 70,
                minSize: 70,
                maxSize: 80,
            },
            {
                accessorKey: 'price',
                header: 'Стоимость',
                cell: ({ row }) => {
                    const price = row.getValue('price') as number;
                    return <span className="font-medium text-green-600">{price} ₽/сутки</span>;
                },
                size: 70,
                minSize: 70,
                maxSize: 85,
            },
            {
                accessorKey: 'comment',
                header: 'Комментарий',
                cell: ({ row }) => {
                    const comment = row.getValue('comment') as string;
                    if (!comment) return <span className="text-muted-foreground">—</span>;

                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="truncate max-w-[200px] block">{comment}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-[300px]">{comment}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                },
            },
            {
                accessorKey: 'room_features',
                header: 'Особенности',
                size: 400,
                minSize: 350,
                maxSize: 500,
                cell: ({ row }) => {
                    const features = row.getValue('room_features') as string[];
                    if (!features || features.length === 0) {
                        return <span className="text-muted-foreground">—</span>;
                    }

                    return (
                        <div className="flex flex-wrap gap-1">
                            {features.map((feature) => (
                                <Badge key={feature} variant="outline" className="text-xs">
                                    {getFeatureLabel(feature)}
                                </Badge>
                            ))}
                            {/* {features.length > 2 && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge variant="outline" className="text-xs">
                                                +{features.length - 2}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <div className="space-y-1">
                                                {features.map((feature) => (
                                                    <div key={feature}>{feature}</div>
                                                ))}
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )} */}
                        </div>
                    );
                },
            },
            {
                id: 'actions',
                header: 'Действия',
                cell: ({ row }) => {
                    const room = row.original;
                    return (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onEdit(room)}
                                className="h-8 w-8 p-0"
                            >
                                <Edit className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                },
            },
        ],
        [onEdit],
    );

    // Настройка таблицы
    const table = useReactTable({
        data: rooms,
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
            const room = row.original;
            const searchValue = filterValue.toLowerCase();
            return (
                room?.title?.toLowerCase().includes(searchValue) ||
                room?.comment?.toLowerCase().includes(searchValue) ||
                room?.room_features?.some((feature) =>
                    feature.toLowerCase().includes(searchValue),
                ) ||
                room?.price?.toString().includes(searchValue) ||
                room?.quantity?.toString().includes(searchValue)
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
                <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Загрузка номеров...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="sm:rounded-none sm:shadow-none sm:border-none md:rounded-md md:shadow-md md:border-md">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <CardTitle>Номера отеля</CardTitle>
                        <Badge variant="secondary" className="text-sm">
                            Всего: {table.getFilteredRowModel().rows.length}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        {onAddRoom && (
                            <TravelButton
                                label="Добавить номер"
                                onClick={onAddRoom}
                                className={isMobile ? 'w-full' : ''}
                            />
                        )}
                    </div>
                </div>

                {/* Поиск */}
                <div className={cx('relative', isMobile ? 'w-full' : 'max-w-md')}>
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder={
                            isMobile
                                ? 'Поиск...'
                                : 'Поиск по названию, комментарию, особенностям...'
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

            <CardContent className="p-1 min-h-[65vh]">
                {/* Мобильная версия - карточки */}
                {isMobile ? (
                    <div className="space-y-4">
                        {table.getFilteredRowModel().rows.length > 0 ? (
                            table
                                .getFilteredRowModel()
                                .rows.map((row) => (
                                    <MobileRoomCard
                                        key={row.id}
                                        room={row.original}
                                        onEdit={onEdit}
                                        onDelete={handleDelete}
                                        isDeleting={isDeleting}
                                    />
                                ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                {globalFilter
                                    ? 'Номера не найдены по заданному критерию поиска'
                                    : 'Номера отсутствуют'}
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
                                            <TableHead
                                                key={header.id}
                                                style={{
                                                    width: header.column.getSize(),
                                                    minWidth:
                                                        header.column.columnDef.minSize ??
                                                        undefined,
                                                    maxWidth:
                                                        header.column.columnDef.maxSize ??
                                                        undefined,
                                                }}
                                            >
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
                                                <TableCell
                                                    key={cell.id}
                                                    style={{
                                                        width: cell.column.getSize(),
                                                        minWidth:
                                                            cell.column.columnDef.minSize ??
                                                            undefined,
                                                        maxWidth:
                                                            cell.column.columnDef.maxSize ??
                                                            undefined,
                                                    }}
                                                >
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
                                                ? 'Номера не найдены по заданному критерию поиска'
                                                : 'Номера отсутствуют'}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                {/* Пагинация */}
                {table.getPageCount() > 1 && (
                    <div className="flex items-center justify-between p-0 w-full">
                        <div className="text-sm text-muted-foreground">
                            Показано{' '}
                            {table.getState().pagination.pageIndex *
                                table.getState().pagination.pageSize +
                                1}
                            -
                            {Math.min(
                                (table.getState().pagination.pageIndex + 1) *
                                    table.getState().pagination.pageSize,
                                table.getFilteredRowModel().rows.length,
                            )}{' '}
                            из {table.getFilteredRowModel().rows.length} записей
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => table.previousPage()}
                                disabled={!table.getCanPreviousPage()}
                            >
                                Назад
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
                                onClick={() => table.nextPage()}
                                disabled={!table.getCanNextPage()}
                            >
                                Вперед
                            </Button>
                        </div>
                    </div>
                )}
            </CardFooter>
        </Card>
    );
};
