import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LayoutStyle, layoutTemplates } from "@/data/layoutTemplates";

interface LayoutState {
  currentLayout: LayoutStyle;
  setLayout: (layout: LayoutStyle) => void;
  getLayoutConfig: () => typeof layoutTemplates[0]["preview"];
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      currentLayout: "default",
      setLayout: (layout) => set({ currentLayout: layout }),
      getLayoutConfig: () => {
        const template = layoutTemplates.find((t) => t.id === get().currentLayout);
        return template?.preview || layoutTemplates[0].preview;
      },
    }),
    { name: "findash-layout" }
  )
);