"use client";
import { useState } from "react";
import ConfigBackupModal from "./ConfigBackupModal";
import { useDashboardStore } from "@/store/dashboardStore";
import { WidgetConfig } from "@/types/widget";

export default function ConfigBackupButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const widgets = useDashboardStore((s) => s.widgets);

  const handleImport = (importedWidgets: WidgetConfig[], mode: "merge" | "replace") => {
    const store = useDashboardStore.getState();
    
    if (mode === "replace") {
      const currentWidgets = [...store.widgets];
      currentWidgets.forEach((w) => {
        store.removeWidget(w.id);
      });
    }

    importedWidgets.forEach((widget) => {
      store.addWidget(widget);
    });
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
        title="Export or import dashboard configuration"
      >
        💾 Dashboard Snapshot
      </button>

      <ConfigBackupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        widgets={widgets}
        onImport={handleImport}
      />
    </>
  );
}