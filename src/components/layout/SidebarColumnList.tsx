"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useColumnsStore } from "@/store/columns";
import { getReorderedColumnIds } from "@/lib/columnReorder";
import { ShareColumnModal } from "@/components/feed/ShareColumnModal";
import type { FeedColumnConfig } from "@/types";

export function SidebarColumnList() {
  const columns = useColumnsStore((s) => s.columns);
  const reorderColumns = useColumnsStore((s) => s.reorderColumns);
  const [shareColumn, setShareColumn] = useState<FeedColumnConfig | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const ids = getReorderedColumnIds(columns, event);
    if (ids) reorderColumns(ids);
  }

  if (columns.length === 0) return null;

  return (
    <>
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          My columns
        </p>
        {mounted ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-0.5">
                {columns.map((col) => (
                  <SortableColumnRow
                    key={col.id}
                    column={col}
                    onShare={() => setShareColumn(col)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {columns.map((col) => (
              <StaticColumnRow
                key={col.id}
                column={col}
                onShare={() => setShareColumn(col)}
              />
            ))}
          </ul>
        )}
      </div>

      {shareColumn && (
        <ShareColumnModal column={shareColumn} onClose={() => setShareColumn(null)} />
      )}
    </>
  );
}

function StaticColumnRow({
  column,
  onShare,
}: {
  column: FeedColumnConfig;
  onShare: () => void;
}) {
  return (
    <li className="flex items-center gap-0.5 min-w-0 rounded-lg">
      <span className="shrink-0 p-1.5 text-[var(--muted)]" aria-hidden>
        <IconGrip />
      </span>
      <button
        type="button"
        onClick={() => {
          document
            .getElementById(`column-${column.id}`)
            ?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        }}
        className="flex-1 min-w-0 text-left px-1.5 py-1.5 rounded-lg text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors truncate"
        title={`Scroll to ${column.title}`}
      >
        {column.title}
      </button>
      <button
        type="button"
        onClick={onShare}
        className="shrink-0 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        title={`Share ${column.title}`}
        aria-label={`Share ${column.title}`}
      >
        <IconShareSmall />
      </button>
    </li>
  );
}

function SortableColumnRow({
  column,
  onShare,
}: {
  column: FeedColumnConfig;
  onShare: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-0.5 min-w-0 rounded-lg ${isDragging ? "bg-[var(--surface-hover)] z-10" : ""}`}
    >
      <button
        type="button"
        className="shrink-0 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
        aria-label={`Reorder ${column.title}`}
        {...attributes}
        {...listeners}
      >
        <IconGrip />
      </button>
      <button
        type="button"
        onClick={() => {
          document
            .getElementById(`column-${column.id}`)
            ?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        }}
        className="flex-1 min-w-0 text-left px-1.5 py-1.5 rounded-lg text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors truncate"
        title={`Scroll to ${column.title}`}
      >
        {column.title}
      </button>
      <button
        type="button"
        onClick={onShare}
        className="shrink-0 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        title={`Share ${column.title}`}
        aria-label={`Share ${column.title}`}
      >
        <IconShareSmall />
      </button>
    </li>
  );
}

function IconGrip() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="7" r="1.25" />
      <circle cx="15" cy="7" r="1.25" />
      <circle cx="9" cy="12" r="1.25" />
      <circle cx="15" cy="12" r="1.25" />
      <circle cx="9" cy="17" r="1.25" />
      <circle cx="15" cy="17" r="1.25" />
    </svg>
  );
}

function IconShareSmall() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}
