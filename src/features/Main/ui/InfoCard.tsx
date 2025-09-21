'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useScreenSize } from '@/shared/lib/useScreenSize';
import { ArrowRight } from 'lucide-react';
import React from 'react';

/**
 * Интерфейс пропсов для компонента InfoCard
 */
export interface InfoCardProps {
    /** Заголовок карточки */
    title: string;
    /** Количество/число для отображения */
    count: number;
    /** Иконка для отображения */
    icon: React.ReactNode;
    /** Конфигурация кнопки */
    button: {
        title: string;
        onClick: () => void;
    };
    /** Дополнительный CSS класс */
    className?: string;
    /** Цветовая схема карточки */
    variant?: 'default' | 'success' | 'warning' | 'info';
    /** Показать ли анимацию роста */
    showGrowth?: boolean;
    /** Процент роста (если showGrowth = true) */
    growthPercent?: number;
}

/**
 * Крутая информационная карточка с современным дизайном и анимациями
 */
export const InfoCard: React.FC<InfoCardProps> = ({
    title,
    count,
    icon,
    button,
    className,
    variant = 'default',
    showGrowth = false,
    growthPercent = 0,
}) => {
    const { isMobile } = useScreenSize();

    // Цветовые схемы для разных вариантов
    const variantStyles = {
        default: {
            gradient: 'from-blue-50 to-indigo-50',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            countColor: 'text-blue-700',
            button: 'bg-blue-600 hover:bg-blue-700',
        },
        success: {
            gradient: 'from-green-50 to-emerald-50',
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
            countColor: 'text-green-700',
            button: 'bg-green-600 hover:bg-green-700',
        },
        warning: {
            gradient: 'from-amber-50 to-orange-50',
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            countColor: 'text-amber-700',
            button: 'bg-amber-600 hover:bg-amber-700',
        },
        info: {
            gradient: 'from-cyan-50 to-teal-50',
            iconBg: 'bg-cyan-100',
            iconColor: 'text-cyan-600',
            countColor: 'text-cyan-700',
            button: 'bg-cyan-600 hover:bg-cyan-700',
        },
    };

    const styles = variantStyles[variant];

    // Анимация чисел
    const [animatedCount, setAnimatedCount] = React.useState(0);

    React.useEffect(() => {
        const duration = 1000; // 1 секунда
        const increment = count / (duration / 16); // 60 FPS
        let current = 0;

        const timer = setInterval(() => {
            current += increment;
            if (current >= count) {
                setAnimatedCount(count);
                clearInterval(timer);
            } else {
                setAnimatedCount(Math.floor(current));
            }
        }, 16);

        return () => clearInterval(timer);
    }, [count]);

    return (
        <Card
            className={cn(
                'group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] cursor-pointer',
                `bg-gradient-to-br ${styles.gradient}`,
                'border-0 shadow-lg',
                isMobile ? 'h-auto' : 'min-h-48',
                className,
            )}
        >
            {/* Декоративные элементы */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-12 translate-x-12 group-hover:scale-110 transition-transform duration-500" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-8 -translate-x-8 group-hover:scale-110 transition-transform duration-500" />

            <CardContent className="relative p-6 h-full flex flex-col">
                {/* Заголовок и иконка */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl md:text-2xl font-bold text-gray-800 group-hover:text-gray-900 transition-colors">
                        {title}
                    </h3>
                    <div
                        className={cn(
                            'p-4 rounded-2xl transition-all duration-300 group-hover:scale-110',
                            'bg-white/80 backdrop-blur-sm',
                            'shadow-lg group-hover:shadow-xl',
                            'border border-white/20',
                        )}
                    >
                        <div className={cn('w-8 h-8 md:w-10 md:h-10', styles.iconColor)}>
                            {icon}
                        </div>
                    </div>
                </div>

                {/* Основное число */}
                <div className="flex-1 flex items-center">
                    <div className="w-full">
                        <div
                            className={cn(
                                'text-5xl md:text-6xl lg:text-7xl font-extrabold transition-all duration-300',
                                styles.countColor,
                                'group-hover:scale-105',
                                'leading-none',
                            )}
                        >
                            {animatedCount.toLocaleString('ru-RU')}
                        </div>
                    </div>
                </div>

                {/* Кнопка действия */}
                <div className="mt-4">
                    <Button
                        onClick={button.onClick}
                        className={cn(
                            'w-full group/btn transition-all duration-300',
                            styles.button,
                            'shadow-md hover:shadow-lg',
                            'transform hover:scale-[1.02]',
                        )}
                        size={isMobile ? 'default' : 'lg'}
                    >
                        <span className="flex items-center justify-center gap-2">
                            {button.title}
                            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                        </span>
                    </Button>
                </div>

                {/* Эффект свечения при hover */}
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300 pointer-events-none" />
            </CardContent>
        </Card>
    );
};

/**
 * Предустановленные варианты InfoCard для разных типов данных
 */
export const HotelInfoCard: React.FC<Omit<InfoCardProps, 'variant'>> = (props) => (
    <InfoCard {...props} variant="success" />
);

export const RoomInfoCard: React.FC<Omit<InfoCardProps, 'variant'>> = (props) => (
    <InfoCard {...props} variant="info" />
);

export const ReservationInfoCard: React.FC<Omit<InfoCardProps, 'variant'>> = (props) => (
    <InfoCard {...props} variant="warning" />
);
