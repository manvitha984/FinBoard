"use client";

import { useState } from "react";
import AddWidgetModal from "@/components/AddWidgetModal";
import CacheControl from "@/components/CacheControl";
import ConfigBackupButton from "@/components/ConfigBackupButton";
import ThemeToggle from "@/components/ThemeToggle";
import { useDashboardStore } from "@/store/dashboardStore";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";
import WidgetCard from "@/components/WidgetCard";

function SortableItem({ widget }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <WidgetCard widget={widget} />
    </div>
  );
}

export default function DashboardPage() {
  const [open, setOpen] = useState(false);
  const widgets = useDashboardStore((s) => s.widgets);
  const reorderWidgets = useDashboardStore((s) => s.reorderWidgets);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const cardWidgets = widgets.filter((w) => w.displayMode === "card");
  const tableWidgets = widgets.filter((w) => w.displayMode === "table");
  const chartWidgets = widgets.filter((w) => w.displayMode === "chart");

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);

    reorderWidgets(oldIndex, newIndex);
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Finance Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Build your real-time finance widgets
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ConfigBackupButton />
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            onClick={() => setOpen(true)}
          >
            + Add Widget
          </button>
        </div>
      </div>

      {widgets.length === 0 && (
        <div className="border border-[var(--card-border)] bg-[var(--card-bg)] p-6 rounded-xl text-[var(--text-muted)]">
          No widgets added yet. Click "+ Add Widget" to get started.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-6">
          {cardWidgets.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📋 Quick Metrics</h2>
              <SortableContext items={cardWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {cardWidgets.map((widget) => (
                    <SortableItem key={widget.id} widget={widget} />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {chartWidgets.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📈 Charts</h2>
              <SortableContext items={chartWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {chartWidgets.map((widget) => (
                    <SortableItem key={widget.id} widget={widget} />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {tableWidgets.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📊 Data Tables</h2>
              <SortableContext items={tableWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="space-y-4">
                  {tableWidgets.map((widget) => (
                    <SortableItem key={widget.id} widget={widget} />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}
        </div>

        <DragOverlay />
      </DndContext>

      <AddWidgetModal isOpen={open} onClose={() => setOpen(false)} />
      <CacheControl />
    </div>
  );
}