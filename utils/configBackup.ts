import { WidgetConfig } from "@/types/widget";

export interface BackupConfig {
  version: string;
  exportDate: string;
  widgetCount: number;
  widgets: WidgetConfig[];
}

class ConfigBackup {
  private readonly VERSION = "1.0.0";


  exportConfig(widgets: WidgetConfig[]): string {
    const backup: BackupConfig = {
      version: this.VERSION,
      exportDate: new Date().toISOString(),
      widgetCount: widgets.length,
      widgets: JSON.parse(JSON.stringify(widgets)), 
    };

    return JSON.stringify(backup, null, 2);
  }

 
  downloadConfig(widgets: WidgetConfig[], filename?: string): void {
    const json = this.exportConfig(widgets);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `findash-backup-${this.getTimestamp()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

 
  importConfig(jsonString: string): { success: boolean; widgets?: WidgetConfig[]; error?: string } {
    try {
      const backup: BackupConfig = JSON.parse(jsonString);

      if (!backup.version || !Array.isArray(backup.widgets)) {
        return {
          success: false,
          error: "Invalid backup format. Missing version or widgets array.",
        };
      }

      if (!this.isVersionCompatible(backup.version)) {
        return {
          success: false,
          error: `Backup version ${backup.version} is not compatible with current app version ${this.VERSION}`,
        };
      }

      const validatedWidgets = this.validateWidgets(backup.widgets);
      if (validatedWidgets.invalid.length > 0) {
        console.warn(
          `⚠️ Found ${validatedWidgets.invalid.length} invalid widgets. Importing ${validatedWidgets.valid.length} valid widgets.`,
          validatedWidgets.invalid
        );
      }

      return {
        success: true,
        widgets: validatedWidgets.valid,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown parsing error",
      };
    }
  }

 
  async importFromFile(file: File): Promise<{ success: boolean; widgets?: WidgetConfig[]; error?: string }> {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const jsonString = event.target?.result as string;
          const result = this.importConfig(jsonString);
          resolve(result);
        } catch (error) {
          resolve({
            success: false,
            error: "Failed to read file",
          });
        }
      };

      reader.onerror = () => {
        resolve({
          success: false,
          error: "Failed to read file",
        });
      };

      reader.readAsText(file);
    });
  }

 
  mergeWidgets(existing: WidgetConfig[], imported: WidgetConfig[]): WidgetConfig[] {
    const newWidgets = imported.map((w) => ({
      ...w,
      id: `${w.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    }));

    return [...newWidgets, ...existing];
  }

 
  replaceWidgets(imported: WidgetConfig[]): WidgetConfig[] {
    return imported.map((w) => ({
      ...w,
      createdAt: Date.now(),
    }));
  }

 
  getBackupInfo(jsonString: string): { valid: boolean; info?: BackupConfig; error?: string } {
    try {
      const backup: BackupConfig = JSON.parse(jsonString);

      if (!backup.version || !Array.isArray(backup.widgets)) {
        return { valid: false, error: "Invalid backup format" };
      }

      return { valid: true, info: backup };
    } catch (error) {
      return { valid: false, error: "Invalid JSON" };
    }
  }

 
  createSnapshot(widgets: WidgetConfig[]): string {
    return JSON.stringify({
      version: this.VERSION,
      timestamp: Date.now(),
      widgets,
    });
  }


  restoreFromSnapshot(snapshot: string): WidgetConfig[] | null {
    try {
      const data = JSON.parse(snapshot);
      return Array.isArray(data.widgets) ? data.widgets : null;
    } catch {
      return null;
    }
  }

  private isVersionCompatible(backupVersion: string): boolean {
    const [backupMajor] = backupVersion.split(".");
    const [appMajor] = this.VERSION.split(".");
    return backupMajor === appMajor;
  }

  private validateWidgets(widgets: any[]): { valid: WidgetConfig[]; invalid: any[] } {
    const valid: WidgetConfig[] = [];
    const invalid: any[] = [];

    widgets.forEach((w, idx) => {
      try {
        if (!w.id || !w.name || !w.apiUrl || !w.displayMode || w.refreshSeconds === undefined) {
          invalid.push({ index: idx, widget: w, reason: "Missing required fields" });
          return;
        }

        if (!["card", "table", "chart"].includes(w.displayMode)) {
          invalid.push({ index: idx, widget: w, reason: "Invalid displayMode" });
          return;
        }

        valid.push(w);
      } catch (error) {
        invalid.push({ index: idx, widget: w, reason: String(error) });
      }
    });

    return { valid, invalid };
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
  }
}

export const configBackup = new ConfigBackup();