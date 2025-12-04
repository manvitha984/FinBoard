"use client";
import { useEffect, useRef, useState } from "react";
import { useDashboardStore } from "@/store/dashboardStore";
import { WidgetConfig } from "@/types/widget";
import { fetchJson } from "@/utils/apiClient";
import { normalizeData } from "@/utils/dataMapper";
import { startPolling } from "@/utils/polling";
import TableWidget from "./TableWidget";
import ChartWidget from "./ChartWidget";
import EditWidgetModal from "./EditWidgetModal";

function getByPath(obj: any, path: string) {
  const segments = path.split(".");
  let cur = obj;
  for (const seg of segments) {
    if (cur == null) return undefined;
    if (seg.endsWith("[]")) {
      const k = seg.replace("[]", "");
      cur = cur[k];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

function detectApiError(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  
  if (data["Error Message"]) return data["Error Message"];
  if (data["error_message"]) return data["error_message"];
  if (data["Information"]) return data["Information"];
  if (data["information"]) return data["information"];
  if (data["Note"]) return data["Note"];
  if (data["note"]) return data["note"];
  
  if (data.error) return String(data.error);
  if (data.message && typeof data.message === "string") {
    const lower = data.message.toLowerCase();
    if (lower.includes("error") || lower.includes("invalid") || lower.includes("fail") || lower.includes("limit")) {
      return data.message;
    }
  }
  
  return null;
}

export default function WidgetCard({ widget }: { widget: WidgetConfig }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [openEdit, setOpenEdit] = useState(false);

  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const actionsRef = useRef<HTMLDivElement | null>(null);

  async function fetchData() {
    try {
      setStatus("loading");
      const result = await fetchJson(widget.apiUrl);
      
      if (!result.ok) {
        setStatus("error");
        setErrorMsg(result.message);
        setData(null);
        return;
      }

      const apiError = detectApiError(result.data);
      if (apiError) {
        setStatus("error");
        setErrorMsg(`API Error: ${apiError}`);
        setData(null);
        return;
      }

      const normalized = normalizeData(result.data);
      
      const normalizedError = detectApiError(normalized);
      if (normalizedError) {
        setStatus("error");
        setErrorMsg(`API Error: ${normalizedError}`);
        setData(null);
        return;
      }

      setData(normalized);
      setStatus("ok");
      setErrorMsg("");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    }
  }

  useEffect(() => {
    const { start, stop } = startPolling(fetchData, widget.refreshSeconds * 1000);
    start();
    return stop;
  }, [widget.apiUrl, widget.refreshSeconds]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsRef, openEdit]);

  return (
    <>
      <div className="bg-[#0f172a] rounded-xl p-4 border border-gray-700 shadow-lg h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {widget.displayMode === "table" && <span className="text-xl">📊</span>}
            {widget.displayMode === "chart" && <span className="text-xl">📈</span>}
            {widget.displayMode === "card" && <span className="text-xl">📋</span>}
            <h3 className="font-semibold text-white truncate">{widget.name}</h3>
          </div>

          <div className="flex items-center gap-2" ref={actionsRef}>
            <div className="text-xs text-gray-400 px-2 py-1 bg-gray-800 rounded">
              {widget.refreshSeconds}s
            </div>
            <button
              className="p-2 rounded hover:bg-gray-700 text-gray-400"
              onClick={fetchData}
              disabled={status === "loading"}
              title="Refresh now"
            >
              <span className={status === "loading" ? "animate-spin inline-block" : ""}>
                🔄
              </span>
            </button>
            <button
              className="p-2 rounded hover:bg-gray-700 text-gray-400"
              onClick={() => setOpenEdit(true)}
              title="Edit widget"
            >
              ⚙️
            </button>
            <button
              className="p-2 rounded hover:bg-gray-700 text-red-400"
              onClick={() => removeWidget(widget.id)}
              title="Delete widget"
            >
              🗑️
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {status === "loading" && (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400">Loading...</div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
              <div className="text-4xl">⚠️</div>
              <div className="text-red-400 text-sm text-center">{errorMsg}</div>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                onClick={fetchData}
              >
                Retry
              </button>
            </div>
          )}

          {status === "ok" && data && (
            <>
              {widget.displayMode === "card" && (
                <div className="space-y-2">
                  {(widget.card?.fields || widget.fields || []).map((field) => {
                    const val = getByPath(data, field);
                    return (
                      <div key={field} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                        <span className="text-sm text-gray-300 font-mono truncate">{field}</span>
                        <span className="text-white font-semibold ml-2">
                          {val !== undefined && val !== null
                            ? typeof val === "object"
                              ? JSON.stringify(val).slice(0, 50)
                              : String(val)
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {widget.displayMode === "table" && widget.table && (
                <TableWidget data={data} config={widget.table} />
              )}

              {widget.displayMode === "chart" && widget.chart && (
                <ChartWidget data={data} config={widget.chart} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {lastUpdated && (
          <div className="mt-3 text-xs text-gray-500 text-right">
            Last updated: {lastUpdated}
          </div>
        )}
      </div>

      {openEdit && (
        <EditWidgetModal
          widget={widget}
          onClose={() => setOpenEdit(false)}
          onSave={(patch) => {
            updateWidget(widget.id, patch);
            setOpenEdit(false);
          }}
        />
      )}
    </>
  );
}