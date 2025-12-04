export type DisplayMode = "card" | "table" | "chart";

export type ChartInterval = "1d" | "1w" | "1m";

export interface TableConfig {
  arrayPath: string;       
  columns: { key: string; label: string }[]; 
  pageSize: number;
  searchableKeys?: string[]; 
}

export interface ChartConfig {
  arrayPath: string;   
  xKey: string;       
  yKey: string;        
  interval?: ChartInterval;
}

export interface CardConfig {
  fields: string[];
}

export interface WidgetConfig {
  id: string;
  name: string;
  apiUrl: string;
  refreshSeconds: number;
  displayMode: DisplayMode;
  fields: string[]; 
  card?: CardConfig;
  table?: TableConfig;
  chart?: ChartConfig;
  createdAt: number;
}