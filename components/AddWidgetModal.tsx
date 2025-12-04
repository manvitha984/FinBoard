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
    const keys = sampleRow ? Object.keys(sampleRow) : [];
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#0f172a] p-6 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-lg border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Add New Widget</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✖
          </button>
        </div>

        <label className="text-sm text-gray-300">Widget Name</label>
        <input
          type="text"
          placeholder="e.g., Bitcoin Price Tracker"
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 border border-gray-700 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="text-sm text-gray-300">API URL</label>
        <div className="flex gap-2 mt-1 mb-2">
          <input
            type="text"
            placeholder="e.g., https://api.coinbase.com/v2/exchange-rates?currency=BTC"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <button
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 whitespace-nowrap"
            onClick={testApi}
            disabled={!apiUrl || testing}
            aria-label="Test API"
          >
            {testing ? "Testing..." : "Test"}
          </button>
        </div>

        {testOk === true && (
          <div className="text-xs text-green-400 mb-3 flex items-center gap-2">
            <span>🟢</span>
            <span>{testMsg}</span>
          </div>
        )}
        {testOk === false && (
          <div className="text-xs text-red-400 mb-3 flex items-center gap-2">
            <span>🔴</span>
            <span>{testMsg}</span>
          </div>
        )}

        <label className="text-sm text-gray-300">Refresh Interval (seconds)</label>
        <input
          type="number"
          placeholder="30"
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 border border-gray-700 text-white"
          value={refreshSeconds}
          onChange={(e) => setRefreshSeconds(Math.max(5, Number(e.target.value || 30)))}
          min={5}
        />

        {showConfig && (
          <>
            <label className="text-sm text-gray-300">Display Mode</label>
            <div className="flex gap-2 mt-1 mb-3">
              {(["card", "table", "chart"] as DisplayMode[]).map((m) => (
                <button
                  key={m}
                  className={`px-3 py-2 rounded border text-sm ${
                    displayMode === m ? "bg-green-700 border-green-500" : "bg-gray-800 border-gray-700"
                  }`}
                  onClick={() => setDisplayMode(m)}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {displayMode === "card" && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="text"
                    placeholder="Search for fields..."
                    className="flex-1 p-2 rounded bg-gray-800 border border-gray-700 text-white"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-300 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={arraysOnly}
                      onChange={(e) => setArraysOnly(e.target.checked)}
                    />
                    Arrays only
                  </label>
                </div>

                <div className="mb-3">
                  <div className="text-xs text-gray-400 mb-1">Available Fields</div>
                  <div className="max-h-44 overflow-auto rounded border border-gray-700 bg-gray-900">
                    {!rawJson && (
                      <div className="p-3 text-xs text-gray-500">Test an API to load available fields.</div>
                    )}
                    {rawJson && availableFields.length === 0 && (
                      <div className="p-3 text-xs text-gray-500">No fields matched.</div>
                    )}
                    {rawJson && availableFields.length > 0 && (
                      <ul className="divide-y divide-gray-800">
                        {availableFields.map((f) => (
                          <li key={f.path} className="flex items-center justify-between p-2 hover:bg-gray-800">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white font-mono truncate">{f.path}</div>
                              <div className="text-xs text-gray-400">
                                {f.type}
                                {f.sample ? ` • ${f.sample}` : ""}
                              </div>
                            </div>
                            <button
                              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded ml-2"
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
                  <div className="text-xs text-gray-400 mb-1">Selected Fields</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFields.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-white"
                      >
                        <span className="font-mono">{f}</span>
                        <button className="text-gray-400 hover:text-white" onClick={() => removeField(f)}>
                          ✕
                        </button>
                      </span>
                    ))}
                    {selectedFields.length === 0 && (
                      <span className="text-xs text-gray-500">No fields selected.</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {displayMode === "table" && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-300 mb-1">Choose array for table rows</div>
                  <div className="rounded border border-gray-700 bg-gray-900 p-3 max-h-48 overflow-auto">
                    {!rawJson && (
                      <div className="text-xs text-gray-500">
                        Test the API first to load available arrays.
                      </div>
                    )}
                    {rawJson && arrayFieldOptions.length === 0 && (
                      <div className="text-xs text-red-400">
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
                              className={`px-2 py-1 rounded border text-xs font-mono text-left ${
                                active
                                  ? "bg-green-700 border-green-500 text-white"
                                  : "bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700"
                              }`}
                              onClick={() => setTableArrayPath(field.path)}
                            >
                              <div className="truncate max-w-[180px]">{field.path}</div>
                              {field.sample && (
                                <div className="text-[10px] text-gray-400 truncate">{field.sample}</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Click an array to use it for the table. You can override manually below.
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-300">Custom array path (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. data.rates"
                    className="w-full mt-1 p-2 rounded bg-gray-800 border border-gray-700 text-white"
                    value={tableArrayPath}
                    onChange={(e) => setTableArrayPath(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-sm text-gray-300 mb-1">Columns detected from sample</div>
                  <div className="rounded border border-gray-700 bg-gray-900 p-3 space-y-2">
                    {!tableArrayPath && (
                      <div className="text-xs text-gray-500">Select an array path to preview columns.</div>
                    )}
                    {tableArrayPath && tableAvailableColumns.length === 0 && (
                      <div className="text-xs text-red-400">
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
                              className={`px-2 py-1 rounded text-xs font-mono border ${
                                active
                                  ? "bg-green-700 border-green-500 text-white"
                                  : "bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700"
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
                  <p className="text-xs text-gray-500 mt-1">
                    Click to pick the fields you want to display. Labels are autogenerated.
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-300">Page size</label>
                  <input
                    type="number"
                    className="w-full mt-1 p-2 rounded bg-gray-800 border border-gray-700 text-white"
                    value={tablePageSize}
                    onChange={(e) => setTablePageSize(Math.max(5, Number(e.target.value || 10)))}
                    min={5}
                  />
                </div>
              </div>
            )}

            {displayMode === "chart" && (
              <div className="space-y-3">
                <label className="text-sm text-gray-300">Array path for points or object map</label>
                <input
                  type="text"
                  placeholder="e.g. data.bpi or data.prices"
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                  value={chartArrayPath}
                  onChange={(e) => setChartArrayPath(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-300">X key</label>
                    <input
                      type="text"
                      placeholder="time or x"
                      className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                      value={chartXKey}
                      onChange={(e) => setChartXKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Y key</label>
                    <input
                      type="text"
                      placeholder="price or y"
                      className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                      value={chartYKey}
                      onChange={(e) => setChartYKey(e.target.value)}
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  If the path points to an object like {"{ date: price }"}, use x: "x", y: "y".
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
            Cancel
          </button>
          <button
            className={`px-4 py-2 rounded text-white ${
              canAdd ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 cursor-not-allowed"
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