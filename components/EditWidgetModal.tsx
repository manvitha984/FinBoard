"use client";
import { useEffect, useMemo, useState } from "react";
import { WidgetConfig, DisplayMode } from "@/types/widget";
import { fetchJson } from "@/utils/apiClient";
import { normalizeData } from "@/utils/dataMapper";

type FlatKey = {
  path: string;
  type: string;
  sample?: string;
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
    if (sample && typeof sample === "object") {
      return sample;
    }
    if (sample !== undefined) {
      return { value: sample };
    }
    return null;
  }

  if (typeof target === "object") {
    const entries = Object.entries(target);

    if (!entries.length) return null;

    const [dateKey, dateValues] = entries[0];

    if (dateValues && typeof dateValues === "object" && !Array.isArray(dateValues)) {
      const sampleRow = { date: dateKey, ...dateValues };
      return sampleRow;
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

  const errorKeys = [
    "Error Message", "error_message",
    "Information", "information",
    "Note", "note",
    "error", "Error"
  ];

  for (const key of errorKeys) {
    if (data[key]) {
      const msg = String(data[key]);
      const lower = msg.toLowerCase();
      if (
        lower.includes("error") ||
        lower.includes("invalid") ||
        lower.includes("fail") ||
        lower.includes("limit") ||
        lower.includes("detected") ||
        lower.includes("premium") ||
        lower.includes("subscribe")
      ) {
        return msg;
      }
    }
  }

  if (data.message && typeof data.message === "string") {
    const lower = data.message.toLowerCase();
    if (
      lower.includes("error") ||
      lower.includes("invalid") ||
      lower.includes("fail") ||
      lower.includes("limit")
    ) {
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
          lower.includes("we have detected your api key") ||
          lower.includes("rate limit") ||
          lower.includes("invalid api key") ||
          lower.includes("invalid api call") ||
          lower.includes("premium plan") ||
          lower.includes("please visit") ||
          lower.includes("please retry") ||
          lower.includes("please subscribe") ||
          lower.includes("higher api call frequency")
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

export default function EditWidgetModal({
  widget,
  onClose,
  onSave,
}: {
  widget: WidgetConfig;
  onClose: () => void;
  onSave: (patch: Partial<WidgetConfig>) => void;
}) {
  const [name, setName] = useState(widget.name);
  const [apiUrl, setApiUrl] = useState(widget.apiUrl);
  const [refreshSeconds, setRefreshSeconds] = useState<number>(widget.refreshSeconds);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(widget.displayMode);

  const [selectedFields, setSelectedFields] = useState<string[]>(
    widget.card?.fields ?? widget.fields ?? []
  );

  const [tableArrayPath, setTableArrayPath] = useState(widget.table?.arrayPath || "");
  const [tableAvailableColumns, setTableAvailableColumns] = useState<string[]>([]);
  const [tableSelectedColumns, setTableSelectedColumns] = useState<string[]>(
    widget.table?.columns?.map((c) => c.key) || []
  );
  const [tablePageSize, setTablePageSize] = useState<number>(widget.table?.pageSize || 10);

  const [chartArrayPath, setChartArrayPath] = useState(widget.chart?.arrayPath || "");
  const [chartXKey, setChartXKey] = useState(widget.chart?.xKey || "x");
  const [chartYKey, setChartYKey] = useState(widget.chart?.yKey || "y");

  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testMsg, setTestMsg] = useState<string>("");
  const [rawJson, setRawJson] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [arraysOnly, setArraysOnly] = useState(false);

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

  async function testApi() {
    setTesting(true);
    setTestOk(null);
    setTestMsg("");
    setRawJson(null);

    const res = await fetchJson(apiUrl);
    if (!res.ok) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(res.message);
      return;
    }

    const rawError = detectApiError(res.data);
    if (rawError) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(`${rawError}`);
      return;
    }

    const normalized = normalizeData(res.data);

    const normalizedError = detectApiError(normalized);
    if (normalizedError) {
      setTesting(false);
      setTestOk(false);
      setTestMsg(`${normalizedError}`);
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

  function save() {
    const patch: Partial<WidgetConfig> = {
      name,
      apiUrl,
      refreshSeconds,
      displayMode,
    };

    if (displayMode === "card") {
      patch.card = { fields: selectedFields };
      patch.fields = selectedFields;
      patch.table = undefined;
      patch.chart = undefined;
    } else if (displayMode === "table") {
      patch.table = {
        arrayPath: tableArrayPath,
        columns: tableSelectedColumns.map((key) => ({
          key,
          label: humanizeLabel(key),
        })),
        pageSize: tablePageSize,
      };
      patch.card = undefined;
      patch.chart = undefined;
    } else if (displayMode === "chart") {
      patch.chart = {
        arrayPath: chartArrayPath,
        xKey: chartXKey,
        yKey: chartYKey,
      };
      patch.card = undefined;
      patch.table = undefined;
    }

    onSave(patch);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--card-bg)] p-6 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-[var(--card-border)]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Edit Widget</h2>
          <button 
            onClick={onClose} 
            className="p-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✖
          </button>
        </div>

        <div className="space-y-4">
          {/* Widget Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Widget Name</label>
            <input
              type="text"
              className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter widget name"
            />
          </div>

          {/* API URL */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">API URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.example.com/data"
              />
              <button
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium whitespace-nowrap transition-colors"
                onClick={testApi}
                disabled={!apiUrl || testing}
              >
                {testing ? "Testing..." : "Test"}
              </button>
            </div>
          </div>

          {/* Test Result */}
          {testOk === true && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="text-emerald-500">✓</span>
              <span className="text-sm text-emerald-600 dark:text-emerald-400">{testMsg}</span>
            </div>
          )}
          {testOk === false && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <span className="text-red-500">✗</span>
              <span className="text-sm text-red-600 dark:text-red-400">{testMsg}</span>
            </div>
          )}

          {/* Refresh Interval */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Refresh Interval (seconds)</label>
            <input
              type="number"
              className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={refreshSeconds}
              onChange={(e) => setRefreshSeconds(Math.max(5, Number(e.target.value || 30)))}
              min={5}
            />
          </div>

          {/* Display Mode */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Display Mode</label>
            <div className="flex gap-2">
              {(["card", "table", "chart"] as DisplayMode[]).map((m) => (
                <button
                  key={m}
                  className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    displayMode === m 
                      ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:border-[var(--text-muted)]"
                  }`}
                  onClick={() => setDisplayMode(m)}
                >
                  {m === "card" && "💳 "}
                  {m === "table" && "📊 "}
                  {m === "chart" && "📈 "}
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Card Mode Fields */}
          {displayMode === "card" && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search for fields..."
                  className="flex-1 p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={arraysOnly}
                    onChange={(e) => setArraysOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--input-border)] text-blue-600 focus:ring-blue-500"
                  />
                  Arrays only
                </label>
              </div>

              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Available Fields</div>
                <div className="max-h-44 overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)]">
                  {!rawJson && (
                    <div className="p-4 text-sm text-[var(--text-muted)] text-center">
                      Test the API to load fields from the current URL.
                    </div>
                  )}
                  {rawJson && availableFields.length === 0 && (
                    <div className="p-4 text-sm text-[var(--text-muted)] text-center">No fields matched.</div>
                  )}
                  {rawJson && availableFields.length > 0 && (
                    <ul className="divide-y divide-[var(--card-border)]">
                      {availableFields.map((f) => (
                        <li key={f.path} className="flex items-center justify-between p-3 hover:bg-[var(--card-bg)] transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[var(--text-primary)] font-mono truncate">{f.path}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {f.type}
                              {f.sample ? ` • ${f.sample}` : ""}
                            </div>
                          </div>
                          <button
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md ml-2 font-medium transition-colors"
                            onClick={() => addField(f.path)}
                          >
                            + Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">Selected Fields</div>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)]">
                  {selectedFields.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-sm text-blue-600 dark:text-blue-400"
                    >
                      <span className="font-mono text-xs">{f}</span>
                      <button
                        className="hover:text-red-500 transition-colors"
                        onClick={() => removeField(f)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {selectedFields.length === 0 && (
                    <span className="text-sm text-[var(--text-muted)]">No fields selected. Add fields from above.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Table Mode Config */}
          {displayMode === "table" && (
            <div className="space-y-4 pt-2">
              <div>
                <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">Choose array for table rows</div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-3 max-h-48 overflow-auto">
                  {!rawJson && (
                    <div className="text-sm text-[var(--text-muted)] text-center py-2">
                      Test the API first to load available arrays.
                    </div>
                  )}
                  {rawJson && arrayFieldOptions.length === 0 && (
                    <div className="text-sm text-red-500 text-center py-2">
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
                            className={`px-3 py-2 rounded-lg border text-xs font-mono text-left transition-all ${
                              active
                                ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                : "bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--card-bg)] hover:border-[var(--text-muted)]"
                            }`}
                            onClick={() => setTableArrayPath(field.path)}
                          >
                            <div className="truncate max-w-[180px]">{field.path}</div>
                            {field.sample && (
                              <div className={`text-[10px] truncate mt-0.5 ${active ? "text-emerald-200" : "text-[var(--text-muted)]"}`}>
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
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Custom array path (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. data.rates"
                  className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={tableArrayPath}
                  onChange={(e) => setTableArrayPath(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">Columns detected from sample</div>
                <div className="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-3 space-y-2">
                  {!tableArrayPath && (
                    <div className="text-sm text-[var(--text-muted)] text-center py-2">Select an array path to preview columns.</div>
                  )}
                  {tableArrayPath && tableAvailableColumns.length === 0 && (
                    <div className="text-sm text-red-500 text-center py-2">
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
                            className={`px-3 py-2 rounded-lg text-xs font-mono border transition-all ${
                              active
                                ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                : "bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text-primary)] hover:bg-[var(--card-bg)] hover:border-[var(--text-muted)]"
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
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Page size</label>
                <input
                  type="number"
                  className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={tablePageSize}
                  onChange={(e) => setTablePageSize(Math.max(5, Number(e.target.value || 10)))}
                  min={5}
                />
              </div>
            </div>
          )}

          {/* Chart Mode Config */}
          {displayMode === "chart" && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Array path for points or object map</label>
                <input
                  type="text"
                  placeholder="e.g. data.bpi or data.prices"
                  className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={chartArrayPath}
                  onChange={(e) => setChartArrayPath(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">X key</label>
                  <input
                    type="text"
                    placeholder="time or x"
                    className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={chartXKey}
                    onChange={(e) => setChartXKey(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Y key</label>
                  <input
                    type="text"
                    placeholder="price or y"
                    className="w-full p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    value={chartYKey}
                    onChange={(e) => setChartYKey(e.target.value)}
                  />
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] bg-[var(--hover-bg)] p-3 rounded-lg border border-[var(--card-border)]">
                💡 If the path points to an object like <code className="bg-[var(--card-bg)] px-1 py-0.5 rounded">{"{ date: price }"}</code>, use x: "x", y: "y".
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--card-border)]">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-[var(--hover-bg)] hover:bg-[var(--card-border)] text-[var(--text-secondary)] rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors shadow-lg shadow-emerald-500/20"
            onClick={save}
            disabled={!name || !apiUrl}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}