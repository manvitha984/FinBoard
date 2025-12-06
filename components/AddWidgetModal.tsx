"use client";
import { useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "@/store/dashboardStore";
import { WidgetConfig, DisplayMode } from "@/types/widget";
import { fetchJson } from "@/utils/apiClient";
import { normalizeData } from "@/utils/dataMapper";

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FlatKey = {
  path: string;
  type: string;
  sample?: string;
  isArrayItem?: boolean;
};

function flattenJson(obj: any, prefix = "", acc: FlatKey[] = []): FlatKey[] {
  if (obj === null || obj === undefined) return acc;
  const isPrimitive = (v: any) =>
    ["string", "number", "boolean"].includes(typeof v) || v === null;

  if (Array.isArray(obj)) {
    const sample = obj[0];
    acc.push({
      path: prefix || "[]",
      type: "array",
      sample: isPrimitive(sample) ? String(sample) : JSON.stringify(sample)?.slice(0, 32),
    });
    if (!isPrimitive(sample)) flattenJson(sample, prefix ? `${prefix}[]` : "[]", acc);
    return acc;
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj);
    if (keys.length > 0) {
      const values = keys.map((k) => obj[k]);
      const allPrimitive = values.every((v) => isPrimitive(v));
      
      if (allPrimitive && prefix) {
        acc.push({
          path: prefix,
          type: "array",
          sample: String(values[0]),
        });
      }
    }

    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const p = prefix ? `${prefix}.${k}` : k;
      if (isPrimitive(v)) {
        acc.push({
          path: p,
          type: v === null ? "null" : typeof v,
          sample: v === null ? "null" : String(v),
        });
      } else if (Array.isArray(v)) {
        const sample = v[0];
        acc.push({
          path: p,
          type: "array",
          sample: isPrimitive(sample) ? String(sample) : JSON.stringify(sample)?.slice(0, 32),
        });
        if (!isPrimitive(sample)) flattenJson(sample, `${p}[]`, acc);
      } else {
        flattenJson(v, p, acc);
      }
    }
  }
  return acc;
}

function getValueAtPath(data: any, path: string) {
  if (!data || !path) return undefined;
  const segments = path.split(".").filter(Boolean);
  return segments.reduce((acc, segment) => {
    if (acc == null) return undefined;
    const clean = segment.replace(/\[\]/g, "");
    return acc?.[clean];
  }, data);
}

function getTableSampleRow(data: any, path: string) {
  const target = getValueAtPath(data, path);
  if (!target) return null;

  if (Array.isArray(target)) {
    const sample = target[0];
    if (sample && typeof sample === "object") return sample;
    if (sample !== undefined) return { value: sample };
    return null;
  }

  if (typeof target === "object") {
    const entries = Object.entries(target);
    if (!entries.length) return null;
    
    const [dateKey, dateValues] = entries[0];
    
    if (dateValues && typeof dateValues === "object" && !Array.isArray(dateValues)) {
      return { date: dateKey, ...dateValues };
    }
    
    return { key: dateKey, value: dateValues };
  }

  return null;
}

function humanizeLabel(key: string) {
  return key
    .replace(/[_\-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  
  function scanForErrors(obj: any, depth = 0): string | null {
    if (depth > 3) return null;
    
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (
          lower.includes("thank you for using alpha vantage") ||
          lower.includes("rate limit") ||
          lower.includes("invalid api key") ||
          lower.includes("invalid api call") ||
          lower.includes("premium plan") ||
          lower.includes("please retry") ||
          lower.includes("please subscribe")
        ) {
          return value;
        }
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        const nestedError = scanForErrors(value, depth + 1);
        if (nestedError) return nestedError;
      }
    }
    return null;
  }
  
  const deepError = scanForErrors(data);
  if (deepError) return deepError;
  
  return null;
}

export default function AddWidgetModal({ isOpen, onClose }: AddWidgetModalProps) {
  const addWidget = useDashboardStore((s) => s.addWidget);

  const [name, setName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [refreshSeconds, setRefreshSeconds] = useState<number>(30);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("card");

  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMsg, setTestMsg] = useState<string>("");
  const [rawJson, setRawJson] = useState<any>(null);

  const [search, setSearch] = useState("");
  const [arraysOnly, setArraysOnly] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const [chartArrayPath, setChartArrayPath] = useState("");
  const [chartXKey, setChartXKey] = useState("x");
  const [chartYKey, setChartYKey] = useState("y");

  const [tableArrayPath, setTableArrayPath] = useState("");
  const [tableAvailableColumns, setTableAvailableColumns] = useState<string[]>([]);
  const [tableSelectedColumns, setTableSelectedColumns] = useState<string[]>([]);
  const [tablePageSize, setTablePageSize] = useState(10);

  const flatFields = useMemo(() => flattenJson(rawJson || {}), [rawJson]);

  const availableFields: FlatKey[] = useMemo(() => {
    const filtered = arraysOnly ? flatFields.filter((f) => f.type === "array") : flatFields;
    return filtered.filter((f) =>
      search ? f.path.toLowerCase().includes(search.toLowerCase()) : true
    );
  }, [flatFields, search, arraysOnly]);

  const arrayFieldOptions = useMemo(
    () => flatFields.filter((f) => f.type === "array"),
    [flatFields]
  );

  useEffect(() => {
    if (!rawJson || !tableArrayPath) {
      setTableAvailableColumns([]);
      setTableSelectedColumns([]);
      return;
    }

    const sampleRow = getTableSampleRow(rawJson, tableArrayPath);
    
    let keys: string[] = [];
    if (sampleRow) {
      const allKeys = Object.keys(sampleRow);
      
      const priorityKeys = ['key', 'symbol', 'date', 'name', 'id'];
      const orderedKeys: string[] = [];
      
      priorityKeys.forEach(pk => {
        if (allKeys.includes(pk)) {
          orderedKeys.push(pk);
        }
      });
      
      const remainingKeys = allKeys
        .filter(k => !priorityKeys.includes(k))
        .sort();
      
      keys = [...orderedKeys, ...remainingKeys];
    }
    
    setTableAvailableColumns(keys);
    setTableSelectedColumns((prev) => {
      if (!keys.length) return [];
      const stillValid = prev.filter((k) => keys.includes(k));
      if (stillValid.length) return stillValid;
      return keys;
    });
  }, [rawJson, tableArrayPath]);

  if (!isOpen) return null;

  async function testApi() {
    setTesting(true);
    setTestOk(null);
    setTestMsg("");
    setRawJson(null);

    const result = await fetchJson(apiUrl);
    if (!result.ok) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(result.message);
      return;
    }

    const rawError = detectApiError(result.data);
    if (rawError) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(`API Error: ${rawError}`);
      return;
    }

    const normalized = normalizeData(result.data);
    
    const normalizedError = detectApiError(normalized);
    if (normalizedError) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(`API Error: ${normalizedError}`);
      return;
    }

    const topKeys = Object.keys(normalized || {});
    const hasOnlyMetadata = topKeys.length === 1 && (
      topKeys[0] === 'meta_data' || 
      topKeys[0] === 'metadata' ||
      topKeys[0].includes('meta')
    );

    if (hasOnlyMetadata) {
      setTesting(false);
      setTestOk(false);
      setTestMsg("API returned only metadata. Please verify your API key and parameters.");
      return;
    }

    if (topKeys.length === 0) {
      setTesting(false);
      setTestOk(false);
      setTestMsg("API returned empty response.");
      return;
    }

    setRawJson(normalized);
    setTestOk(true);
    setTestMsg(`API connection successful! ${topKeys.length} top-level fields found.`);
    setTesting(false);
  }

  function addField(path: string) {
    setSelectedFields((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }

  function removeField(path: string) {
    setSelectedFields((prev) => prev.filter((p) => p !== path));
  }

  function toggleTableColumn(key: string) {
    setTableSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function onAdd() {
    if (!name || !apiUrl || testOk !== true) return;
    const base: WidgetConfig = {
      id: crypto.randomUUID(),
      name,
      apiUrl,
      refreshSeconds,
      displayMode,
      fields: selectedFields,
      card: { fields: selectedFields },
      createdAt: Date.now(),
    };

    if (displayMode === "chart") {
      base.chart = {
        arrayPath: chartArrayPath,
        xKey: chartXKey,
        yKey: chartYKey,
      };
    } else if (displayMode === "table") {
      base.table = {
        arrayPath: tableArrayPath,
        columns: tableSelectedColumns.map((key) => ({
          key,
          label: humanizeLabel(key),
        })),
        pageSize: tablePageSize,
      };
    }

    addWidget(base);
    onClose();
    setName("");
    setApiUrl("");
    setSelectedFields([]);
    setRawJson(null);
    setTestOk(null);
    setTestMsg("");
    setSearch("");
    setArraysOnly(false);
    setDisplayMode("card");
    setRefreshSeconds(30);
    setChartArrayPath("");
    setChartXKey("x");
    setChartYKey("y");
    setTableArrayPath("");
    setTableAvailableColumns([]);
    setTableSelectedColumns([]);
    setTablePageSize(10);
  }

  const showConfig = testOk === true;
  const canAdd =
    !!name &&
    !!apiUrl &&
    testOk === true &&
    ((displayMode === "card" && selectedFields.length > 0) ||
      (displayMode === "chart" && !!chartArrayPath && !!chartXKey && !!chartYKey) ||
      (displayMode === "table" && !!tableArrayPath && tableSelectedColumns.length > 0));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--modal-bg)] p-6 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto modal-scroll shadow-2xl border border-[var(--modal-border)]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Add New Widget</h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✖
          </button>
        </div>

        <label className="text-sm font-medium text-[var(--text-secondary)]">Widget Name</label>
        <input
          type="text"
          placeholder="e.g., Bitcoin Price Tracker"
          className="w-full mt-1 mb-4 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="text-sm font-medium text-[var(--text-secondary)]">API URL</label>
        <div className="flex gap-2 mt-1 mb-2">
          <input
            type="text"
            placeholder="e.g., https://api.coinbase.com/v2/exchange-rates?currency=BTC"
            className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <button
            className="px-5 py-3 bg-[var(--accent-blue)] text-white rounded-lg hover:opacity-90 whitespace-nowrap font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={testApi}
            disabled={!apiUrl || testing}
            aria-label="Test API"
          >
            {testing ? "Testing..." : "Test"}
          </button>
        </div>

        {testOk === true && (
          <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-4 flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-200 dark:border-emerald-500/20">
            <span>✓</span>
            <span>{testMsg}</span>
          </div>
        )}
        {testOk === false && (
          <div className="text-sm text-red-600 dark:text-red-400 mb-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20">
            <span>✗</span>
            <span>{testMsg}</span>
          </div>
        )}

        <label className="text-sm font-medium text-[var(--text-secondary)]">Refresh Interval (seconds)</label>
        <input
          type="number"
          placeholder="30"
          className="w-full mt-1 mb-4 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
          value={refreshSeconds}
          onChange={(e) => setRefreshSeconds(Math.max(5, Number(e.target.value || 30)))}
          min={5}
        />

        {showConfig && (
          <>
            <label className="text-sm font-medium text-[var(--text-secondary)]">Display Mode</label>
            <div className="flex gap-2 mt-1 mb-4">
              {(["card", "table", "chart"] as DisplayMode[]).map((m) => (
                <button
                  key={m}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    displayMode === m 
                      ? "bg-[var(--accent-green)] border-[var(--accent-green)] text-white" 
                      : "bg-[var(--button-secondary-bg)] border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--button-secondary-hover)]"
                  }`}
                  onClick={() => setDisplayMode(m)}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {displayMode === "card" && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Search for fields..."
                    className="flex-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={arraysOnly}
                      onChange={(e) => setArraysOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--input-border)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]"
                    />
                    Arrays only
                  </label>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wide">Available Fields</div>
                  <div className="max-h-44 overflow-auto rounded-lg border border-[var(--input-border)] bg-[var(--field-bg)]">
                    {!rawJson && (
                      <div className="p-4 text-sm text-[var(--text-muted)]">Test an API to load available fields.</div>
                    )}
                    {rawJson && availableFields.length === 0 && (
                      <div className="p-4 text-sm text-[var(--text-muted)]">No fields matched.</div>
                    )}
                    {rawJson && availableFields.length > 0 && (
                      <ul className="divide-y divide-[var(--divider)]">
                        {availableFields.map((f) => (
                          <li key={f.path} className="flex items-center justify-between p-3 hover:bg-[var(--field-hover)] transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-[var(--text-primary)] font-mono truncate">{f.path}</div>
                              <div className="text-xs text-[var(--text-muted)]">
                                {f.type}
                                {f.sample ? ` • ${f.sample}` : ""}
                              </div>
                            </div>
                            <button
                              className="text-xs px-3 py-1.5 bg-[var(--accent-blue)] hover:opacity-90 text-white rounded-md ml-2 font-medium transition-all"
                              onClick={() => addField(f.path)}
                            >
                              +
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wide">Selected Fields</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFields.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 text-sm text-[var(--accent-blue)]"
                      >
                        <span className="font-mono">{f}</span>
                        <button 
                          className="hover:text-[var(--accent-red)] transition-colors" 
                          onClick={() => removeField(f)}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {selectedFields.length === 0 && (
                      <span className="text-sm text-[var(--text-muted)]">No fields selected.</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {displayMode === "table" && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">Choose array for table rows</div>
                  <div className="rounded-lg border border-[var(--input-border)] bg-[var(--field-bg)] p-3 max-h-48 overflow-auto">
                    {!rawJson && (
                      <div className="text-sm text-[var(--text-muted)]">
                        Test the API first to load available arrays.
                      </div>
                    )}
                    {rawJson && arrayFieldOptions.length === 0 && (
                      <div className="text-sm text-[var(--accent-red)]">
                        No array fields were detected in this payload.
                      </div>
                    )}
                    {arrayFieldOptions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {arrayFieldOptions.map((field) => {
                          const active = tableArrayPath === field.path;
                          return (
                            <button
                              key={field.path}
                              type="button"
                              className={`px-3 py-2 rounded-lg border text-sm font-mono text-left transition-all ${
                                active
                                  ? "bg-[var(--accent-green)] border-[var(--accent-green)] text-white"
                                  : "bg-[var(--button-secondary-bg)] border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--button-secondary-hover)]"
                              }`}
                              onClick={() => setTableArrayPath(field.path)}
                            >
                              <div className="truncate max-w-[180px]">{field.path}</div>
                              {field.sample && (
                                <div className={`text-[10px] truncate ${active ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                                  {field.sample}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Click an array to use it for the table. You can override manually below.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Custom array path (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. data.rates"
                    className="w-full mt-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                    value={tableArrayPath}
                    onChange={(e) => setTableArrayPath(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">Columns detected from sample</div>
                  <div className="rounded-lg border border-[var(--input-border)] bg-[var(--field-bg)] p-3 space-y-2">
                    {!tableArrayPath && (
                      <div className="text-sm text-[var(--text-muted)]">Select an array path to preview columns.</div>
                    )}
                    {tableArrayPath && tableAvailableColumns.length === 0 && (
                      <div className="text-sm text-[var(--accent-red)]">
                        Couldn't find any fields at that path.
                      </div>
                    )}
                    {tableAvailableColumns.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tableAvailableColumns.map((key) => {
                          const active = tableSelectedColumns.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`px-3 py-1.5 rounded-lg text-sm font-mono border transition-all ${
                                active
                                  ? "bg-[var(--accent-green)] border-[var(--accent-green)] text-white"
                                  : "bg-[var(--button-secondary-bg)] border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--button-secondary-hover)]"
                              }`}
                              onClick={() => toggleTableColumn(key)}
                            >
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2">
                    Click to pick the fields you want to display. Labels are autogenerated.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Page size</label>
                  <input
                    type="number"
                    className="w-full mt-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                    value={tablePageSize}
                    onChange={(e) => setTablePageSize(Math.max(5, Number(e.target.value || 10)))}
                    min={5}
                  />
                </div>
              </div>
            )}

            {displayMode === "chart" && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Array path for points or object map</label>
                  <input
                    type="text"
                    placeholder="e.g. data.bpi or data.prices"
                    className="w-full mt-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                    value={chartArrayPath}
                    onChange={(e) => setChartArrayPath(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)]">X key</label>
                    <input
                      type="text"
                      placeholder="time or x"
                      className="w-full mt-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                      value={chartXKey}
                      onChange={(e) => setChartXKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)]">Y key</label>
                    <input
                      type="text"
                      placeholder="price or y"
                      className="w-full mt-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all"
                      value={chartYKey}
                      onChange={(e) => setChartYKey(e.target.value)}
                    />
                  </div>
                </div>
                <div className="text-sm text-[var(--text-muted)] bg-[var(--field-bg)] p-3 rounded-lg border border-[var(--input-border)]">
                  💡 If the path points to an object like {"{ date: price }"}, use x: "x", y: "y".
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--divider)]">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-[var(--button-secondary-bg)] hover:bg-[var(--button-secondary-hover)] text-[var(--button-secondary-text)] rounded-lg font-medium transition-all"
          >
            Cancel
          </button>
          <button
            className={`px-5 py-2.5 rounded-lg text-white font-medium transition-all ${
              canAdd 
                ? "bg-[var(--accent-green)] hover:opacity-90" 
                : "bg-[var(--text-muted)] cursor-not-allowed"
            }`}
            onClick={onAdd}
            disabled={!canAdd}
          >
            Add Widget
          </button>
        </div>
      </div>
    </div>
  );
}