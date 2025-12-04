type Adapter = {
  name: string;
  detect: (input: any) => boolean;
  normalize: (input: any) => any;
};

function sanitizeKey(key: string): string {
  const s = String(key).trim();
  if (/^[A-Z]{2,}$/.test(s)) return s;
  // Preserve dates
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s
    .replace(/^\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function coerceValue(value: any): any {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      if (!Number.isNaN(n)) return n;
    }
  }
  return value;
}

function deepNormalize(value: any): any {
  if (Array.isArray(value)) return value.map(deepNormalize);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[sanitizeKey(k)] = deepNormalize(v);
    }
    return out;
  }
  return coerceValue(value);
}

const alphaVantageAdapter: Adapter = {
  name: "alphavantage",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    const keys = Object.keys(input);
    return (
      keys.includes("Meta Data") ||
      keys.includes("Global Quote") ||
      keys.includes("Time Series (Daily)") ||
      keys.includes("Realtime Currency Exchange Rate") ||
      keys.some(k => /^Time Series/.test(k)) ||
      keys.some(k => /^\d+\.\s+/.test(k))
    );
  },
  normalize: (input) => {
    const normalized = deepNormalize(input);
    return { data: normalized };
  },
};

const coinbaseAdapter: Adapter = {
  name: "coinbase",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    return input.data && (input.data.currency || input.data.rates || input.data.base);
  },
  normalize: (input) => {
    return { data: deepNormalize(input.data) };
  },
};

const restApiAdapter: Adapter = {
  name: "rest",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    return (
      (input.success === true || input.status === "success") &&
      input.data !== undefined
    );
  },
  normalize: (input) => {
    return { data: deepNormalize(input.data) };
  },
};

const paginatedAdapter: Adapter = {
  name: "paginated",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    return (
      Array.isArray(input.results) ||
      Array.isArray(input.items) ||
      (input.data && Array.isArray(input.data))
    );
  },
  normalize: (input) => {
    let items = input.results || input.items || input.data;
    return {
      data: {
        items: deepNormalize(items),
        pagination: {
          page: input.page || input.current_page || 1,
          total: input.total || input.total_count || items.length,
          per_page: input.per_page || input.page_size || items.length,
        },
      },
    };
  },
};

const graphqlAdapter: Adapter = {
  name: "graphql",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    return input.data !== undefined && input.errors === undefined;
  },
  normalize: (input) => {
    return { data: deepNormalize(input.data) };
  },
};

const timeSeriesAdapter: Adapter = {
  name: "timeseries",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    const keys = Object.keys(input);
    const dateKeys = keys.filter(k => /^\d{4}-\d{2}-\d{2}/.test(k));
    return dateKeys.length > 0 && dateKeys.length / keys.length > 0.5;
  },
  normalize: (input) => {
    return {
      data: {
        time_series: deepNormalize(input),
      },
    };
  },
};

const genericDataAdapter: Adapter = {
  name: "generic_data",
  detect: (input) => {
    if (!input || typeof input !== "object") return false;
    return Object.prototype.hasOwnProperty.call(input, "data");
  },
  normalize: (input) => {
    return { data: deepNormalize(input.data) };
  },
};

const universalAdapter: Adapter = {
  name: "universal",
  detect: () => true, 
  normalize: (input) => {
    if (input == null) return { data: null };
    if (typeof input !== "object") return { data: { value: coerceValue(input) } };

    const normalized = deepNormalize(input);

    const hasTopLevelData =
      Object.prototype.hasOwnProperty.call(normalized, "data") &&
      typeof normalized.data === "object";

    if (hasTopLevelData && Object.keys(normalized).length === 1) {
      return { data: normalized.data };
    }

    return { data: normalized };
  },
};

export const adapters: Adapter[] = [
  alphaVantageAdapter,
  coinbaseAdapter,
  graphqlAdapter,
  restApiAdapter,
  paginatedAdapter,
  timeSeriesAdapter,
  genericDataAdapter,
  universalAdapter, 
];

export function normalizeData(raw: any): any {
  for (const adapter of adapters) {
    try {
      if (adapter.detect(raw)) {
        console.log(`🔧 Using ${adapter.name} adapter`);
        const normalized = adapter.normalize(raw);
        if (normalized && typeof normalized === "object") {
          return normalized;
        }
      }
    } catch (err) {
      console.warn(`❌ Adapter ${adapter.name} failed:`, err);
      continue;
    }
  }
  return raw;
}

export function extractAllFields(obj: any, prefix = ""): string[] {
  const fields: string[] = [];
  if (obj === null || obj === undefined) return fields;

  const isPrimitive = (v: any) =>
    ["string", "number", "boolean"].includes(typeof v) || v === null;

  if (Array.isArray(obj)) {
    const sample = obj[0];
    fields.push(prefix || "[]");
    if (!isPrimitive(sample)) {
      fields.push(...extractAllFields(sample, prefix ? `${prefix}[]` : "[]"));
    }
    return fields;
  }

  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isPrimitive(value)) {
        fields.push(path);
      } else if (Array.isArray(value)) {
        const sample = value[0];
        fields.push(path);
        if (!isPrimitive(sample)) {
          fields.push(...extractAllFields(sample, `${path}[]`));
        }
      } else {
        fields.push(...extractAllFields(value, path));
      }
    }
  }

  return fields;
}

export function findArrays(obj: any, prefix = "", acc: Record<string, any[]> = {}) {
  if (!obj || typeof obj !== "object") return acc;

  if (Array.isArray(obj)) {
    const sample = obj[0];
    if (sample && typeof sample === "object") acc[prefix || "[]"] = obj;
    if (sample) findArrays(sample, prefix ? `${prefix}[]` : "[]", acc);
    return acc;
  }

  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      const sample = v[0];
      if (sample && typeof sample === "object") acc[path] = v;
      if (sample) findArrays(sample, `${path}[]`, acc);
    } else if (typeof v === "object") {
      findArrays(v, path, acc);
    }
  }

  return acc;
}