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

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(dateStr);
  }
  
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return new Date(`${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`);
  }
  
  const timestamp = parseInt(dateStr);
  if (!isNaN(timestamp)) {
    return new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000);
  }
  
  return null;
}

function getIntervalDays(interval: ChartInterval): number {
  switch (interval) {
    case "1d": return 1;
    case "1w": return 7;
    case "1m": return 30;
    default: return 30;
  }
}

export default function ChartWidget({ data, config }: { data: any; config?: ChartConfig }) {
  const [interval, setInterval] = useState<ChartInterval>(config?.interval || "1m");
  const xKey = config?.xKey || "x";
  const yKey = config?.yKey || "y";

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

  const allPoints = useMemo(() => {
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

      return arr;
    }

    return [];
  }, [source, xKey, yKey]);

  const points = useMemo(() => {
    if (!isArraySeries || allPoints.length === 0) {
      return [...allPoints]
        .sort((a, b) => (b[yKey] as number) - (a[yKey] as number))
        .slice(0, 12);
    }

    const sampleDate = parseDate(allPoints[0]?.[xKey]);
    if (!sampleDate) {
      return allPoints.slice(-100);
    }

    const sorted = [...allPoints].sort((a, b) => {
      const dateA = parseDate(a[xKey]);
      const dateB = parseDate(b[xKey]);
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });

    const days = getIntervalDays(interval);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const filtered = sorted.filter((p) => {
      const date = parseDate(p[xKey]);
      return date && date >= cutoffDate;
    });

    if (filtered.length === 0) {
      const lastN = interval === "1d" ? 1 : interval === "1w" ? 7 : 30;
      return sorted.slice(-lastN);
    }

    return filtered;
  }, [allPoints, interval, xKey, yKey, isArraySeries]);

  const hasDateData = useMemo(() => {
    if (!isArraySeries || allPoints.length === 0) return false;
    const sampleDate = parseDate(allPoints[0]?.[xKey]);
    return sampleDate !== null;
  }, [isArraySeries, allPoints, xKey]);

  const formatXAxis = (value: string) => {
    const date = parseDate(value);
    if (!date) return value;

    if (interval === "1d") {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (interval === "1w") {
      return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const date = parseDate(label);
    const formattedDate = date 
      ? date.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      : label;

    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded p-2 text-sm shadow-lg">
        <p className="text-[var(--text-muted)] mb-1">{formattedDate}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {tooltipFormatter(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {isArraySeries && hasDateData && (
        <div className="flex items-center gap-2">
          {(["1d", "1w", "1m"] as ChartInterval[]).map((i) => (
            <button
              key={i}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                interval === i
                  ? "bg-green-600 text-white border border-green-500"
                  : "bg-[var(--hover-bg)] text-[var(--text-secondary)] border border-[var(--card-border)] hover:bg-[var(--card-border)]"
              }`}
              onClick={() => setInterval(i)}
            >
              {i === "1d" ? "1 Day" : i === "1w" ? "1 Week" : "1 Month"}
            </button>
          ))}
          <span className="text-xs text-[var(--text-muted)] ml-2">
            {points.length} points
          </span>
        </div>
      )}

      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          {isArraySeries ? (
            <LineChart data={points} margin={{ top: 10, right: 16, bottom: 20, left: 10 }}>
              <CartesianGrid stroke="var(--card-border)" strokeDasharray="4 4" />
              <XAxis 
                dataKey={xKey} 
                stroke="var(--text-muted)" 
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                tickFormatter={formatXAxis}
                interval="preserveStartEnd"
              />
              <YAxis stroke="var(--text-muted)" tick={{ fill: "var(--text-muted)" }} tickFormatter={yTickFormatter} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: "var(--text-muted)" }} />
              <Line 
                type="monotone" 
                dataKey={yKey} 
                stroke="#10b981" 
                dot={points.length < 20 ? { r: 3 } : false} 
                strokeWidth={2}
                name={yKey.charAt(0).toUpperCase() + yKey.slice(1)}
              />
            </LineChart>
          ) : (
            <BarChart data={points} layout="vertical" margin={{ top: 10, right: 16, bottom: 10, left: 80 }} barCategoryGap="20%">
              <CartesianGrid stroke="var(--card-border)" strokeDasharray="4 4" />
              <XAxis type="number" stroke="var(--text-muted)" tick={{ fill: "var(--text-muted)" }} tickFormatter={yTickFormatter} />
              <YAxis
                type="category"
                dataKey={xKey}
                stroke="var(--text-muted)"
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: "var(--text-muted)" }} />
              <Bar dataKey={yKey} fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {points.length === 0 && (
        <div className="text-sm text-[var(--text-muted)] text-center py-4">
          No data available for the selected time range.
        </div>
      )}
    </div>
  );
}