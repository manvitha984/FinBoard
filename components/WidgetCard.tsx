"use client";
import { useEffect, useRef, useState } from "react";
import { useDashboardStore } from "@/store/dashboardStore";
import { WidgetConfig } from "@/types/widget";
import { fetchJson } from "@/utils/apiClient";
import { normalizeData } from "@/utils/dataMapper";
import { startPolling } from "@/utils/polling";
import { adaptiveCache } from "@/utils/adaptiveCache";
import TableWidget from "./TableWidget";
import ChartWidget from "./ChartWidget";
import EditWidgetModal from "./EditWidgetModal";

function getByPath(obj: any, path: string) {
  if (!path) return obj;
  
  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;

    let part = parts[i];

    const arrayMatch = part.match(/^(\w+)\[(\d*)\]$/);
    if (arrayMatch) {
      const key = arrayMatch[1];
      const index = arrayMatch[2] === "" ? 0 : parseInt(arrayMatch[2], 10);

      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      }
    } else {
      current = current[part];
    }
  }

  return current;
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

function formatLabel(field: string): string {
  return field
    .replace(/^data\[\d*\]\./, "")
    .replace(/^data\./, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatValue(val: any): string {
  if (typeof val === "number") {
    if (val % 1 !== 0) {
      return parseFloat(val.toFixed(4)).toString();
    }
    return val.toLocaleString();
  }
  if (typeof val === "object") {
    return JSON.stringify(val).slice(0, 50);
  }
  return String(val);
}

export default function WidgetCard({ widget }: { widget: WidgetConfig }) {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [openEdit, setOpenEdit] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [cacheTTL, setCacheTTL] = useState<number>(0);
  const [requestCount, setRequestCount] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const actionsRef = useRef<HTMLDivElement | null>(null);

  async function fetchData() {
    try {
      setStatus("loading");
      const result = await fetchJson(widget.apiUrl);
      
      setIsCached(result.cached || false);
      setIsLearning(result.learningMode || false);
      
      // Update rate limit info
      if (result.quotaInfo) {
        setRequestCount(result.quotaInfo.requestCount);
        setIsRateLimited(result.quotaInfo.isThrottled || false);
      }
      
      const profile = adaptiveCache.getProfile(widget.apiUrl);
      if (profile) {
        setCacheTTL(Math.round(profile.recommendedTTL / 1000));
      }
      
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
      <div className="bg-[#0f172a] rounded-xl border border-gray-700 shadow-lg h-full flex flex-col overflow-hidden">
        {/* Header Section */}
        <div className="px-4 py-3 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-transparent">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Icon + Title */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {widget.displayMode === "table" && <span className="text-lg">📊</span>}
              {widget.displayMode === "chart" && <span className="text-lg">📈</span>}
              {widget.displayMode === "card" && <span className="text-lg">💳</span>}
              <h3 className="font-semibold text-white truncate text-sm">{widget.name}</h3>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0" ref={actionsRef}>
              <button
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors text-sm"
                onClick={fetchData}
                disabled={status === "loading"}
                title="Refresh now"
              >
                <span className={status === "loading" ? "animate-spin inline-block" : ""}>
                  🔄
                </span>
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors text-sm"
                onClick={() => setOpenEdit(true)}
                title="Edit widget"
              >
                ⚙️
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-red-900/30 text-red-400 hover:text-red-300 transition-colors text-sm"
                onClick={() => removeWidget(widget.id)}
                title="Delete widget"
              >
                🗑️
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 text-xs">
            <div className="flex items-center gap-2">
              {isLearning && (
                <span 
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-md border border-purple-500/20"
                  title="Cache is learning this API's update pattern"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                  Learning Pattern
                </span>
              )}
              {isCached && !isLearning && !isRateLimited && (
                <span 
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20"
                  title="Data served from cache - no API call needed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  From Cache
                </span>
              )}
              {isRateLimited && (
                <span 
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md border border-red-500/20"
                  title="Rate limited - using cached data"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                  Rate Limited (From Cache)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isCached && cacheTTL > 0 && (
                <span 
                  className="text-gray-500" 
                  title={`Cache expires in ${cacheTTL} seconds`}
                >
                  Expires {cacheTTL}s
                </span>
              )}
              <span className="text-gray-400" title="Widget refresh interval">
                ⟳ {widget.refreshSeconds}s
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {status === "loading" && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-gray-400 text-sm">Loading...</div>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
              <div className="text-4xl">⚠️</div>
              <div className="text-red-400 text-sm text-center">{errorMsg}</div>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
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
                  {(() => {
                    let fieldsToDisplay = widget.card?.fields || widget.fields || [];
                    
                    if (fieldsToDisplay.length === 0 && Array.isArray(data.data) && data.data.length > 0) {
                      const firstRow = data.data[0];
                      fieldsToDisplay = Object.keys(firstRow).filter(
                        key => key !== "date" 
                      );
                      if (firstRow.date) {
                        fieldsToDisplay = ["date", ...fieldsToDisplay];
                      }
                    }
                    
                    return fieldsToDisplay.map((field) => {
                      const val = getByPath(data, field);
                      
                      if (val === undefined || val === null) return null;
                      
                      return (
                        <div 
                          key={field} 
                          className="flex justify-between items-center p-2.5 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-gray-600/50 transition-colors"
                        >
                          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                            {formatLabel(field)}
                          </span>
                          <span className="text-white font-semibold ml-2 text-sm">
                            {formatValue(val)}
                          </span>
                        </div>
                      );
                    }).filter(Boolean);
                  })()}
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
          <div className="px-4 py-2 border-t border-gray-700/50 bg-gray-800/30">
            <div className="text-xs text-gray-500 text-right">
              Updated {lastUpdated}
              {requestCount > 0 && ` • API Calls: ${requestCount}`}
            </div>
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