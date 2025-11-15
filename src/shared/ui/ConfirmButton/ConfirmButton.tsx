'use client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import React from 'react';
import { FaRegTrashAlt } from 'react-icons/fa';

export interface ConfirmButtonProps {
    children?: React.ReactNode;
    className?: string;
    onConfirm: () => void;
    /** Текст заголовка */
    title?: string;
    /** Текст описания */
    description?: string;
}

/**
 * Компонент кнопки с подтверждением на основе Shadcn AlertDialog
 */
export const ConfirmButton = ({
    onConfirm,
    children,
    className,
    title = 'Действительно хотите удалить?',
    description = 'Это действие нельзя отменить.',
}: ConfirmButtonProps) => {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`text-red-600 hover:text-red-700 hover:bg-red-50 ${className || ''}`}
                >
                    <FaRegTrashAlt className="w-4 h-4 mr-2" />
                    {children}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <FaRegTrashAlt className="w-5 h-5 text-red-600" />
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    >
                        Удалить
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
