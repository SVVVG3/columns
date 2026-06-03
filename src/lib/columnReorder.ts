import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { FeedColumnConfig } from "@/types";

/** Returns new column id order after a drag, or null if no change. */
export function getReorderedColumnIds(
  columns: FeedColumnConfig[],
  event: DragEndEvent
): string[] | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;

  const oldIndex = columns.findIndex((c) => c.id === active.id);
  const newIndex = columns.findIndex((c) => c.id === over.id);
  if (oldIndex < 0 || newIndex < 0) return null;

  return arrayMove(columns, oldIndex, newIndex).map((c) => c.id);
}
