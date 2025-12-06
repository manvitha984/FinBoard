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

export default function TableWidget({ data, config }: { data: any; config: TableConfig }) {
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

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search table..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <div className="flex-1 overflow-auto mb-3">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              {config.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length} className="px-3 py-4 text-center text-gray-500">
                  {search ? "No matching results" : "No data available"}
                </td>
              </tr>
            ) : (
              pageData.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-800/50">
                  {config.columns.map((col) => {
                    const val = row[col.key];
                    return (
                      <td key={col.key} className="px-3 py-2 text-white whitespace-nowrap">
                        {val !== undefined && val !== null
                          ? typeof val === "object"
                            ? JSON.stringify(val).slice(0, 50)
                            : typeof val === "number" && val % 1 !== 0
                            ? val.toFixed(2)
                            : String(val)
                          : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-gray-800">
        <span>
          {startIdx + 1}-{Math.min(endIdx, filteredArray.length)} of {filteredArray.length} items
        </span>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Prev
          </button>
          <span className="px-3 py-1 bg-gray-800 rounded">
            Page {currentPage} of {totalPages || 1}
          </span>
          <button
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}