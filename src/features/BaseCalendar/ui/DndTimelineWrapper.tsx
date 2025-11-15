import {
    Active,
    DndContext,
    DragEndEvent,
    DragOverEvent,
    DragOverlay,
    DragStartEvent,
    MouseSensor,
    Over,
    TouchSensor,
    useDroppable,
    useSensor,
    useSensors,
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

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
        useSensor(TouchSensor, {
            activationConstraint: {
                distance: 20,
                tolerance: 10,
            },
        }),
    );

    const getIsBefore = (over: Over, active: Active): boolean => {
        const overRect = over.rect;
        // берём четверть от высоты, в связке с overRect.top получится корректная половина (похоже на механизмы dnd-kit)
        const quarterHeight = overRect.height / 2 / 2;
        // расчёт средней высоты - берём текущую координату элемента, добавляем половину его высоты
        const verticalMiddle = overRect.top + quarterHeight;
        const isBefore = active.rect.current.translated!.top < verticalMiddle;

        return isBefore;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        // здесь нужно описать логику, что если ниже середины элементы, то элемент встаёт под него, а если выше, то над ним
        const { active, over } = event;
        if (over && active.id !== over.id) {
            // insertPosition.beforeId - вставляем перед элементом
            // insertPosition.afterId - вставляем после элемента
            const oldIndex = groups.findIndex((group) => group.id === active.id);
            let newIndex = -1;
            if (insertPosition.beforeId) {
                newIndex = groups.findIndex((group) => group.id === insertPosition.beforeId);
            } else if (insertPosition.afterId) {
                newIndex = groups.findIndex((group) => group.id === insertPosition.afterId) + 1;
            }
            if (newIndex !== -1) {
                const newOrder = [...groups.map((g) => g.id)];
                const [removed] = newOrder.splice(oldIndex, 1);
                newOrder.splice(newIndex > oldIndex ? newIndex - 1 : newIndex, 0, removed);
                onGroupsReorder?.(newOrder);
            }
        }
        dragEnded();
    };

    const handleDragStart = (event: DragStartEvent) => {
        dragStarted(event.active.id.toString());
    };

    // для отображения полосочки, эта же логика должна действовать для самого драга
    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const isBefore = getIsBefore(over, active);

        positionChanged({
            beforeId: isBefore ? over.id.toString() : null,
            afterId: isBefore ? null : over.id.toString(),
        });
    };

    return (
        <DndContext
            // collisionDetection={closestCenter}
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => dragCancelled()}
            onDragMove={handleDragOver}
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
