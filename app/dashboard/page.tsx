"use client";

import { useState } from "react";
import AddWidgetModal from "@/components/AddWidgetModal";
import CacheControl from "@/components/CacheControl";
import ConfigBackupButton from "@/components/ConfigBackupButton";
import ThemeToggle from "@/components/ThemeToggle";
import LayoutSelector from "@/components/LayoutSelector";
import { useDashboardStore } from "@/store/dashboardStore";
import { useLayoutStore } from "@/store/layoutStore";

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

function SortableItem({ widget, cardSize, roundedStyle, shadowStyle }: any) {
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
      className={cardSize === "sm" ? "text-sm" : cardSize === "lg" ? "text-base" : ""}
    >
      <WidgetCard 
        widget={widget} 
        compact={cardSize === "sm"}
        roundedStyle={roundedStyle}
        shadowStyle={shadowStyle}
      />
    </div>
  );
}

export default function DashboardPage() {
  const [open, setOpen] = useState(false);
  const widgets = useDashboardStore((s) => s.widgets);
  const reorderWidgets = useDashboardStore((s) => s.reorderWidgets);
  const layoutConfig = useLayoutStore((s) => s.getLayoutConfig());

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

  const { cardCols, chartCols, gap, cardSize, showSectionHeaders, roundedStyle, shadowStyle } = layoutConfig;

  return (
    <div className={`min-h-screen bg-[var(--background)] p-4 sm:p-6 space-y-4 sm:space-y-6`}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Finance Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Build your real-time finance widgets
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <ThemeToggle />
          <LayoutSelector />
          <ConfigBackupButton />
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm sm:text-base"
            onClick={() => setOpen(true)}
          >
            + Add Widget
          </button>
        </div>
      </div>

      {widgets.length === 0 && (
        <div className={`border border-[var(--card-border)] bg-[var(--card-bg)] p-8 ${roundedStyle} text-center`}>
          <div className="text-5xl mb-4">🚀</div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Welcome to FinBoard!
          </h3>
          <p className="text-[var(--text-muted)] mb-6 max-w-md mx-auto">
            Get started by adding widgets to track your favorite financial data.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
          >
            <span>➕</span>
            Add Your First Widget
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className={`space-y-4 sm:space-y-6`}>
          {cardWidgets.length > 0 && (
            <div>
              {showSectionHeaders && (
                <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📋 Quick Metrics</h2>
              )}
              <SortableContext items={cardWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className={`grid ${cardCols} ${gap}`}>
                  {cardWidgets.map((widget) => (
                    <SortableItem 
                      key={widget.id} 
                      widget={widget} 
                      cardSize={cardSize}
                      roundedStyle={roundedStyle}
                      shadowStyle={shadowStyle}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {chartWidgets.length > 0 && (
            <div>
              {showSectionHeaders && (
                <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📈 Charts</h2>
              )}
              <SortableContext items={chartWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className={`grid ${chartCols} ${gap}`}>
                  {chartWidgets.map((widget) => (
                    <SortableItem 
                      key={widget.id} 
                      widget={widget} 
                      cardSize={cardSize}
                      roundedStyle={roundedStyle}
                      shadowStyle={shadowStyle}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {tableWidgets.length > 0 && (
            <div>
              {showSectionHeaders && (
                <h2 className="text-lg font-semibold mb-3 text-[var(--text-secondary)]">📊 Data Tables</h2>
              )}
              <SortableContext items={tableWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className={`space-y-4`}>
                  {tableWidgets.map((widget) => (
                    <SortableItem 
                      key={widget.id} 
                      widget={widget} 
                      cardSize={cardSize}
                      roundedStyle={roundedStyle}
                      shadowStyle={shadowStyle}
                    />
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