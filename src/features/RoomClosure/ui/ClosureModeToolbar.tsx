import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CalendarOff, CalendarPlus } from 'lucide-react';
import cx from './style.module.scss';

export type CanvasAction = 'booking' | 'closure';

type ClosureModeToolbarProps = {
    value: CanvasAction;
    onChange: (value: CanvasAction) => void;
};

export const ClosureModeToolbar = ({ value, onChange }: ClosureModeToolbarProps) => (
    <div className={cx.toolbar}>
        <span className={cx.toolbarLabel}>Режим на шахматке:</span>
        <div className={cx.toolbarButtons}>
            <Button
                type="button"
                size="sm"
                variant={value === 'booking' ? 'default' : 'outline'}
                className={cn(value === 'booking' && cx.activeMode)}
                onClick={() => onChange('booking')}
            >
                <CalendarPlus size={16} />
                Бронь
            </Button>
            <Button
                type="button"
                size="sm"
                variant={value === 'closure' ? 'default' : 'outline'}
                className={cn(value === 'closure' && cx.activeMode)}
                onClick={() => onChange('closure')}
            >
                <CalendarOff size={16} />
                Закрыть даты
            </Button>
        </div>
    </div>
);
