import { InsertionIndicator } from '@/shared/ui/InsertIndicator/InsertIndicator';
import { useSortable } from '@dnd-kit/sortable';
import { useUnit } from 'effector-react/compat';
import { MenuIcon } from 'lucide-react';
import React from 'react';
import { $insertPosition } from './model/dnd';
import styles from './style.module.scss';

export interface DraggableGroupProps {
    id: string;
    children: React.ReactNode;
    title: string;
    className?: string;
    onClick?: () => void;
}

export const DraggableGroup = ({
    id,
    children,
    title,
    className,
    onClick,
}: DraggableGroupProps) => {
    const insertPosition = useUnit($insertPosition);
    const { attributes, listeners, setNodeRef, transition, isDragging } = useSortable({
        id,
    });

    const groupStyle: React.CSSProperties = {
        // transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
    };

    return (
        <div
            ref={setNodeRef}
            style={groupStyle}
            className={`${styles.draggableGroup} ${className || ''}`}
        >
            {insertPosition.beforeId === id && <InsertionIndicator type="before" />}
            <div className={styles.groupHeader}>
                <div
                    className={styles.dragHandle}
                    style={{ touchAction: 'none' }}
                    {...attributes}
                    {...listeners}
                >
                    <span className={styles.dragIcon}>
                        <MenuIcon />
                    </span>
                </div>
                <div
                    className={styles.groupTitle}
                    onClick={onClick}
                    style={{ cursor: onClick ? 'pointer' : 'default' }}
                >
                    {title}
                </div>
            </div>

            <div className={styles.groupContent}>{children}</div>
            {insertPosition.afterId === id && <InsertionIndicator type="after" />}
        </div>
    );
};
