import { InsertionIndicator } from '@/shared/ui/InsertIndicator/InsertIndicator';
import { MenuOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { useUnit } from 'effector-react/compat';
import React from 'react';
import { $insertPosition } from './model/dnd';
import styles from './style.module.scss';

export interface DraggableGroupProps {
    id: string;
    children: React.ReactNode;
    title: string;
    className?: string;
}

export const DraggableGroup = ({ id, children, title, className }: DraggableGroupProps) => {
    const insertPosition = useUnit($insertPosition);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
            {(insertPosition.afterId === id || insertPosition?.beforeId === id) && (
                <InsertionIndicator />
            )}
            <div className={styles.groupHeader}>
                <div className={styles.dragHandle} {...attributes} {...listeners}>
                    <span className={styles.dragIcon}>
                        <MenuOutlined />
                    </span>
                </div>
                <div className={styles.groupTitle}>{title}</div>
            </div>

            <div className={styles.groupContent}>{children}</div>
            {/* {insertPosition.beforeId === id && <InsertionIndicator />} */}
        </div>
    );
};
