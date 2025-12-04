"use client";

import { useState } from "react";
import AddWidgetModal from "@/components/AddWidgetModal";
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
  arrayMove,
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
      className="h-full"
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

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);

    reorderWidgets(oldIndex, newIndex);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Finance Dashboard</h1>
          <p className="text-sm text-gray-400">
            Build your real-time finance widgets
          </p>
        </div>

        <button
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
          onClick={() => setOpen(true)}
        >
          + Add Widget
        </button>
      </div>

      {widgets.length === 0 && (
        <div className="border border-gray-700 p-6 rounded-xl text-gray-400">
          No widgets added yet.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              lg:grid-cols-3
              xl:grid-cols-4
              gap-6
              auto-rows-[minmax(180px,auto)]
            "
          >
            {widgets.map((widget) => (
              <SortableItem key={widget.id} widget={widget} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay />
      </DndContext>

      <AddWidgetModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}
