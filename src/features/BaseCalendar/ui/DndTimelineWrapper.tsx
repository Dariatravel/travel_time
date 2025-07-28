import {
    DndContext,
    DragEndEvent,
    DragOverEvent,
    DragOverlay,
    DragStartEvent,
    useDroppable,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { useUnit } from 'effector-react/compat';
import React from 'react';
import { createPortal } from 'react-dom';
import {
    $activeId,
    $insertPosition,
    dragCancelled,
    dragEnded,
    dragStarted,
    positionChanged,
} from './model/dnd';
export interface DndTimelineWrapperProps {
    children: React.ReactNode;
    groups: Array<{ id: string; title: string }>;
    onGroupsReorder?: (newOrder: string[]) => void;
    timelineId: string;
}

const TimelineDroppable: React.FC<{ id: string; children: React.ReactNode }> = ({
    id,
    children,
}) => {
    const { setNodeRef } = useDroppable({ id });
    return <div ref={setNodeRef}>{children}</div>;
};

export const DndTimelineWrapper = ({
    children,
    groups,
    onGroupsReorder,
    timelineId,
}: DndTimelineWrapperProps) => {
    const activeId = useUnit($activeId);
    const insertPosition = useUnit($insertPosition);
    // const [activeItem, setActiveItem] = useState<DragStartEvent | null>(null);
    // const [insertPosition, setInsertPosition] = useState<{
    //     beforeId: UniqueIdentifier | null;
    //     afterId: UniqueIdentifier | null;
    // }>({ beforeId: null, afterId: null });

    // const handleDragStart = (event: DragStartEvent) => {
    //     console.log(event);
    //     setActiveItem(event);
    // };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = groups.findIndex((group) => group.id === active.id);
            const newIndex = groups.findIndex((group) => group.id === over.id);
            const newOrder = [...groups.map((g) => g.id)];
            const [removed] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, removed);
            onGroupsReorder?.(newOrder);
        }
        dragEnded();
    };

    // const handleDragOver = (event: any) => {
    //     const { active, over } = event;

    //     if (!over) return;

    //     const overRect = over.rect;
    //     const verticalMiddle = overRect.top + overRect.height / 2;

    //     // Определяем позицию вставки
    //     if (active.rect.current.translated) {
    //         const isBefore = active.rect.current.translated.top < verticalMiddle;

    //         setInsertPosition({
    //             beforeId: isBefore ? over.id : null,
    //             afterId: isBefore ? null : over.id,
    //         });
    //     }
    // };

    const handleDragStart = (event: DragStartEvent) => {
        dragStarted(event.active.id.toString());
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const overRect = over.rect;
        const verticalMiddle = overRect.top + overRect.height / 2;
        const isBefore = active.rect.current.translated!.top < verticalMiddle;

        positionChanged({
            beforeId: isBefore ? over.id.toString() : null,
            afterId: isBefore ? null : over.id.toString(),
        });
    };

    return (
        <DndContext
            // collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => dragCancelled()}
            onDragOver={handleDragOver}
        >
            <TimelineDroppable id={timelineId}>
                <SortableContext
                    items={groups.map((group) => group.id)}
                    strategy={rectSortingStrategy}
                >
                    {children}
                </SortableContext>
            </TimelineDroppable>
            {createPortal(
                <DragOverlay
                    modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                    dropAnimation={{
                        duration: 500,
                        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                    }}
                >
                    {activeId ? (
                        <div className="drag-overlay" style={{ zIndex: 9999 }}>
                            {groups.find((group) => group.id === activeId)?.title}
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
};
