"use client";
import { useState, useMemo } from "react";
import { TableConfig } from "@/types/widget";

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

function isNestedCurrencyData(obj: any): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  
  const entries = Object.entries(obj);
  if (entries.length === 0) return false;
  
  const firstValue = entries[0][1];
  if (typeof firstValue !== "object" || firstValue === null || Array.isArray(firstValue)) {
    return false;
  }
  
  const valueKeys = Object.keys(firstValue);
  const currencyPatterns = ["usd", "eur", "gbp", "jpy", "inr", "cad", "aud", "chf"];
  
  return valueKeys.some(k => 
    currencyPatterns.some(curr => k.toLowerCase().includes(curr)) ||
    k.toLowerCase().includes("24h") ||
    k.toLowerCase().includes("change")
  );
}

export default function TableWidget({ 
  data, 
  config,
  compact = false 
}: { 
  data: any; 
  config: TableConfig;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const rawArray = useMemo(() => {
    const result = getByPath(data, config.arrayPath);
    if (!result) return [];
    
    if (Array.isArray(result)) return result;
    
    if (typeof result === "object") {
      if (isNestedCurrencyData(result)) {
        return Object.entries(result).map(([coinName, coinData]: [string, any]) => {
          return {
            name: coinName,
            ...coinData,
          };
        });
      }
      
      return Object.entries(result).map(([dateKey, values]: [string, any]) => {
        if (typeof values === "object" && values !== null) {
          return { date: dateKey, ...values };
        }
        return { key: dateKey, value: values };
      });
    }
    
    return [];
  }, [data, config.arrayPath]);

  const filteredArray = useMemo(() => {
    if (!search.trim()) return rawArray;
    const lower = search.toLowerCase();
    return rawArray.filter((row: any) =>
      config.columns.some((col) => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(lower);
      })
    );
  }, [rawArray, search, config.columns]);

  const pageSize = config.pageSize || 10;
  const totalPages = Math.ceil(filteredArray.length / pageSize);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageData = filteredArray.slice(startIdx, endIdx);

  // Dynamic sizing based on compact mode
  const cellPadding = compact ? "px-2 py-1" : "px-3 py-2";
  const fontSize = compact ? "text-xs" : "text-sm";
  const headerFontSize = compact ? "text-[10px]" : "text-xs";

  return (
    <div className="flex flex-col h-full">
      <div className={compact ? "mb-2" : "mb-3"}>
        <input
          type="text"
          placeholder="Search table..."
          className={`w-full ${cellPadding} bg-[var(--input-bg)] border border-[var(--input-border)] rounded ${fontSize} text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <div className="flex-1 overflow-auto border border-[var(--card-border)] rounded-lg">
        <table className={`w-full ${fontSize}`}>
          <thead className="bg-[var(--card-header)] sticky top-0">
            <tr>
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  className={`${cellPadding} text-left ${headerFontSize} font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--card-border)]`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--card-border)]">
            {pageData.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-[var(--hover-bg)] transition-colors">
                {config.columns.map((col) => {
                  const val = row[col.key];
                  let display: string;
                  if (val === null || val === undefined) {
                    display = "-";
                  } else if (typeof val === "number") {
                    display = val.toLocaleString(undefined, { maximumFractionDigits: 6 });
                  } else if (typeof val === "object") {
                    display = JSON.stringify(val).slice(0, 50);
                  } else {
                    display = String(val);
                  }
                  return (
                    <td key={col.key} className={`${cellPadding} text-[var(--text-primary)]`}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {pageData.length === 0 && (
          <div className={`${compact ? "p-2" : "p-4"} text-center text-[var(--text-muted)] ${fontSize}`}>
            No data found
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className={`flex items-center justify-between ${compact ? "mt-2" : "mt-3"} ${fontSize}`}>
          <span className="text-[var(--text-muted)]">
            {compact 
              ? `${startIdx + 1}-${Math.min(endIdx, filteredArray.length)}/${filteredArray.length}` 
              : `Showing ${startIdx + 1}-${Math.min(endIdx, filteredArray.length)} of ${filteredArray.length}`
            }
          </span>
          <div className="flex gap-1">
            <button
              className={`${compact ? "px-2 py-0.5" : "px-3 py-1"} bg-[var(--card-bg)] border border-[var(--card-border)] rounded hover:bg-[var(--hover-bg)] disabled:opacity-50 text-[var(--text-primary)] transition-colors`}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {compact ? "←" : "← Prev"}
            </button>
            <span className={`${compact ? "px-2 py-0.5" : "px-3 py-1"} text-[var(--text-secondary)]`}>
              {currentPage}/{totalPages}
            </span>
            <button
              className={`${compact ? "px-2 py-0.5" : "px-3 py-1"} bg-[var(--card-bg)] border border-[var(--card-border)] rounded hover:bg-[var(--hover-bg)] disabled:opacity-50 text-[var(--text-primary)] transition-colors`}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              {compact ? "→" : "Next →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}