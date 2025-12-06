"use client";
import { useState, useRef } from "react";
import { WidgetConfig } from "@/types/widget";
import { configBackup } from "@/utils/configBackup";

interface ConfigBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
  onImport: (widgets: WidgetConfig[], mode: "merge" | "replace") => void;
}

export default function ConfigBackupModal({
  isOpen,
  onClose,
  widgets,
  onImport,
}: ConfigBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [backupInfo, setBackupInfo] = useState<any>(null);

  if (!isOpen) return null;

  const handleExport = () => {
    try {
      configBackup.downloadConfig(
        widgets,
        `findash-config-${new Date().toISOString().slice(0, 10)}.json`
      );
      setImportStatus({
        type: "success",
        message: "✅ Configuration exported successfully!",
      });
      setTimeout(() => setImportStatus({ type: "idle", message: "" }), 3000);
    } catch (error) {
      setImportStatus({
        type: "error",
        message: "❌ Failed to export configuration",
      });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus({ type: "loading", message: "Processing file..." });

    try {
      const result = await configBackup.importFromFile(file);

      if (!result.success || !result.widgets) {
        setImportStatus({
          type: "error",
          message: `❌ ${result.error || "Failed to import configuration"}`,
        });
        return;
      }

      // Show preview
      const backupInfoResult = configBackup.getBackupInfo(
        await file.text()
      );
      if (backupInfoResult.valid) {
        setBackupInfo(backupInfoResult.info);
      }

      // Confirm import
      const confirmMessage =
        importMode === "merge"
          ? `Merge ${result.widgets.length} widget(s) with existing ${widgets.length} widget(s)?`
          : `Replace all ${widgets.length} widget(s) with ${result.widgets.length} imported widget(s)?`;

      if (window.confirm(confirmMessage)) {
        const finalWidgets =
          importMode === "merge"
            ? configBackup.mergeWidgets(widgets, result.widgets)
            : configBackup.replaceWidgets(result.widgets);

        onImport(finalWidgets, importMode);
        setImportStatus({
          type: "success",
          message: `✅ ${result.widgets.length} widget(s) imported successfully!`,
        });
        setBackupInfo(null);
        setTimeout(() => {
          setImportStatus({ type: "idle", message: "" });
          onClose();
        }, 2000);
      } else {
        setImportStatus({ type: "idle", message: "" });
        setBackupInfo(null);
      }
    } catch (error) {
      setImportStatus({
        type: "error",
        message: "❌ Failed to import configuration",
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f172a] rounded-xl border border-gray-700 shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-transparent">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              💾 Configuration Backup
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Export Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              📤 Export Configuration
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Download your current dashboard configuration as a JSON file.
            </p>
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors font-medium"
            >
              Export Config ({widgets.length} widgets)
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700/50"></div>

          {/* Import Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              📥 Import Configuration
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Upload a previously exported configuration file.
            </p>

            {/* Import Mode Selector */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === "merge"}
                  onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">
                  Merge with existing widgets
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === "replace"}
                  onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">
                  Replace all widgets
                </span>
              </label>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors font-medium"
            >
              Choose File to Import
            </button>
          </div>

          {/* Backup Info Preview */}
          {backupInfo && (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <h4 className="text-xs font-semibold text-gray-300 mb-2">Backup Info</h4>
              <div className="space-y-1 text-xs text-gray-400">
                <p>📅 Date: {new Date(backupInfo.exportDate).toLocaleString()}</p>
                <p>📦 Widgets: {backupInfo.widgetCount}</p>
                <p>🔖 Version: {backupInfo.version}</p>
              </div>
            </div>
          )}

          {/* Status Messages */}
          {importStatus.type !== "idle" && (
            <div
              className={`p-3 rounded-lg text-sm text-center font-medium ${
                importStatus.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : importStatus.type === "error"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}
            >
              {importStatus.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/50 bg-gray-800/30 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}