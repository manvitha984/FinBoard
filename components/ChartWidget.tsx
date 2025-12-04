"use client";
import { useMemo, useState } from "react";
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { ChartConfig, ChartInterval } from "@/types/widget";

function getByPath(obj: any, path?: string) {
  if (!obj) return undefined;
  if (!path) return obj;
  return path.split(".").reduce((acc, seg) => (acc ? acc[seg] : undefined), obj);
}
function toNumber(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function ChartWidget({ data, config }: { data: any; config?: ChartConfig }) {
  const [interval, setInterval] = useState<ChartInterval>(config?.interval || "1d");
  const xKey = config?.xKey || "x";
  const yKey = config?.yKey || "y";
  const TOP_N = 12;

  const source = useMemo(() => {
    const p = config?.arrayPath;
    return (
      getByPath(data, p) ??
      getByPath(data, p?.replace(/^data\./, "")) ??
      getByPath(data, "data.rates") ??
      getByPath(data, "data.data.rates") ??
      data
    );
  }, [data, config]);

  const isArraySeries = Array.isArray(source);

  const points = useMemo(() => {
    if (!source) return [];

    if (Array.isArray(source)) {
      return source
        .map((p) => {
          const yVal = toNumber(p[yKey]);
          if (yVal == null) return null;
          return { ...p, [yKey]: yVal };
        })
        .filter(Boolean) as Record<string, any>[];
    }

    if (typeof source === "object") {
      const entries = Object.entries(source);
      const map =
        entries.length === 1 &&
        typeof entries[0][1] === "object" &&
        !Array.isArray(entries[0][1])
          ? (entries[0][1] as Record<string, any>)
          : (source as Record<string, any>);

      const arr = Object.entries(map)
        .map(([k, v]) => {
          const yVal = toNumber(v);
          if (yVal == null) return null;
          return { [xKey]: String(k), [yKey]: yVal };
        })
        .filter(Boolean) as Record<string, any>[];

      arr.sort((a, b) => (b[yKey] as number) - (a[yKey] as number));
      return arr.slice(0, TOP_N);
    }

    return [];
  }, [source, xKey, yKey]);

  const yTickFormatter = (v: number) => {
    if (!Number.isFinite(v)) return "";
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(2)}k`;
    return v.toFixed(2);
  };
  const tooltipFormatter = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(value);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        {(["1d", "1w", "1m"] as ChartInterval[]).map((i) => (
          <button
            key={i}
            className={`px-3 py-1 rounded-lg text-xs ${
              interval === i
                ? "bg-green-600 text-white border border-green-500"
                : "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700"
            }`}
            onClick={() => setInterval(i)}
          >
            {i.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          {isArraySeries ? (
            <LineChart data={points} margin={{ top: 10, right: 16, bottom: 20, left: 10 }}>
              <CartesianGrid stroke="#374151" strokeDasharray="4 4" />
              <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tickFormatter={yTickFormatter} width={60} />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 4 }} formatter={tooltipFormatter} />
              <Legend wrapperStyle={{ color: "#9ca3af" }} />
              <Line type="monotone" dataKey={yKey} stroke="#10b981" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          ) : (
           
            <BarChart data={points} layout="vertical" margin={{ top: 10, right: 16, bottom: 10, left: 80 }} barCategoryGap="20%">
              <CartesianGrid stroke="#374151" strokeDasharray="4 4" />
              <XAxis type="number" stroke="#9ca3af" tickFormatter={yTickFormatter} />
              <YAxis
                type="category"
                dataKey={xKey}
                stroke="#9ca3af"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                width={70}
              />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: 4 }} formatter={tooltipFormatter} />
              <Legend wrapperStyle={{ color: "#9ca3af" }} />
              <Bar dataKey={yKey} fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {points.length === 0 && (
        <div className="text-sm text-gray-400">
          No numeric data at “{config?.arrayPath}”. For Coinbase snapshots, use “data.rates” or “data.data.rates”.
        </div>
      )}
    </div>
  );
}