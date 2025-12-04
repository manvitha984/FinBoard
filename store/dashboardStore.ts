import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WidgetConfig } from "@/types/widget";

interface DashboardState {
  widgets: WidgetConfig[];
  addWidget: (w: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, patch: Partial<WidgetConfig>) => void;
  reorderWidgets: (sourceIndex: number, destIndex: number) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: [],
      addWidget: (w) =>
        set((s) => {
          const normalized: WidgetConfig = {
            ...w,
            table: w.displayMode === "table" ? w.table : undefined,
          };
          return { widgets: [normalized, ...s.widgets] };
        }),
      removeWidget: (id) =>
        set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
      updateWidget: (id, patch) =>
        set((s) => ({
          widgets: s.widgets.map((w) => {
            if (w.id !== id) return w;
            const next: WidgetConfig = { ...w, ...patch };
            if (next.displayMode !== "table") {
              next.table = undefined;
            }
            return next;
          }),
        })),
      reorderWidgets: (sourceIndex, destIndex) =>
        set((s) => {
          const next = [...s.widgets];
          const [moved] = next.splice(sourceIndex, 1);
          next.splice(destIndex, 0, moved);
          return { widgets: next };
        }),
    }),
    { name: "findash-dashboard" }
  )
);