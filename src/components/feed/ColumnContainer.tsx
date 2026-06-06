"use client";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useColumnsStore } from "@/store/columns";
import { getReorderedColumnIds } from "@/lib/columnReorder";
import { NewsFeedColumn } from "@/components/feed/NewsFeedColumn";
import { FeedColumn } from "@/components/feed/FeedColumn";

interface ColumnContainerProps {
  viewerFid: number;
}

export function ColumnContainer({ viewerFid }: ColumnContainerProps) {
  const { columns, reorderColumns } = useColumnsStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const ids = getReorderedColumnIds(columns, event);
    if (ids) reorderColumns(ids);
  }

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)] text-sm">
        No columns yet — click <strong className="mx-1 text-white">Add column</strong> to get started.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={columns.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex h-full overflow-x-auto columns-scroll">
          {columns.map((column, index) =>
            column.type === "coindesk" || column.type === "rss" ? (
              <NewsFeedColumn key={column.id} column={column} columnIndex={index} />
            ) : (
              <FeedColumn
                key={column.id}
                column={column}
                columnIndex={index}
                viewerFid={viewerFid}
              />
            )
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
