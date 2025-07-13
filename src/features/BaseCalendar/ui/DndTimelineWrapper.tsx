import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  useSensors,
  useSensor,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import React, { useState } from 'react';

export interface DndTimelineWrapperProps {
  children: React.ReactNode;
  groups: Array<{ id: string; title: string }>;
  onGroupsReorder?: (newOrder: string[]) => void;
  timelineId: string;
}

export const DndTimelineWrapper = ({
  children,
  groups,
  onGroupsReorder,
  timelineId,
}: DndTimelineWrapperProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    console.log({ active, over, activeId });
    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((group) => group.id === active.id);
      const newIndex = groups.findIndex((group) => group.id === over.id);

      const newOrder = [...groups.map((g) => g.id)];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);

      console.log({ groups, newOrder });
      onGroupsReorder?.(newOrder);
    }

    setActiveId(null);
  };

  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map((group) => group.id)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="drag-overlay">{groups.find((group) => group.id === activeId)?.title}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
