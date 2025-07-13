import { MenuOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import styles from './style.module.scss';

export interface DraggableGroupProps {
  id: string;
  children: React.ReactNode;
  title: string;
  className?: string;
}

export const DraggableGroup = ({ id, children, title, className }: DraggableGroupProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    // transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`${styles.draggableGroup} ${className || ''}`}>
      <div className={styles.groupHeader}>
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <span className={styles.dragIcon}>
            <MenuOutlined />
          </span>
        </div>
        <div className={styles.groupTitle}>{title}</div>
      </div>

      <div className={styles.groupContent}>{children}</div>
    </div>
  );
};
