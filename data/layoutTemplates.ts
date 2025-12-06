export type LayoutStyle = "default" | "compact" | "spacious" | "cards-focus" | "charts-focus" | "data-dense";

export interface LayoutTemplate {
  id: LayoutStyle;
  name: string;
  description: string;
  icon: string;
  preview: {
    cardCols: string;
    chartCols: string;
    gap: string;
    cardSize: "sm" | "md" | "lg";
    showSectionHeaders: boolean;
    roundedStyle: string;
    shadowStyle: string;
  };
}

export const layoutTemplates: LayoutTemplate[] = [
  {
    id: "default",
    name: "Default",
    description: "Balanced layout with medium spacing and standard card sizes",
    icon: "📐",
    preview: {
      cardCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      chartCols: "grid-cols-1 lg:grid-cols-2",
      gap: "gap-4",
      cardSize: "md",
      showSectionHeaders: true,
      roundedStyle: "rounded-xl",
      shadowStyle: "shadow-lg",
    },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense layout with smaller cards and minimal spacing - fits more widgets",
    icon: "📦",
    preview: {
      cardCols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
      chartCols: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
      gap: "gap-2",
      cardSize: "sm",
      showSectionHeaders: true,
      roundedStyle: "rounded-lg",
      shadowStyle: "shadow-md",
    },
  },
  {
    id: "spacious",
    name: "Spacious",
    description: "Relaxed layout with generous padding and breathing room",
    icon: "🌊",
    preview: {
      cardCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      chartCols: "grid-cols-1 lg:grid-cols-2",
      gap: "gap-6",
      cardSize: "lg",
      showSectionHeaders: true,
      roundedStyle: "rounded-2xl",
      shadowStyle: "shadow-xl",
    },
  },
  {
    id: "cards-focus",
    name: "Metrics Focus",
    description: "Optimized for quick metrics display - larger cards grid",
    icon: "📊",
    preview: {
      cardCols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5",
      chartCols: "grid-cols-1",
      gap: "gap-4",
      cardSize: "md",
      showSectionHeaders: true,
      roundedStyle: "rounded-xl",
      shadowStyle: "shadow-lg",
    },
  },
  {
    id: "charts-focus",
    name: "Charts Focus",
    description: "Optimized for data visualization - larger charts area",
    icon: "📈",
    preview: {
      cardCols: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6",
      chartCols: "grid-cols-1",
      gap: "gap-4",
      cardSize: "sm",
      showSectionHeaders: true,
      roundedStyle: "rounded-xl",
      shadowStyle: "shadow-lg",
    },
  },
  {
    id: "data-dense",
    name: "Data Dense",
    description: "Maximum information density for power users",
    icon: "🔬",
    preview: {
      cardCols: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
      chartCols: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
      gap: "gap-2",
      cardSize: "sm",
      showSectionHeaders: false,
      roundedStyle: "rounded-lg",
      shadowStyle: "shadow",
    },
  },
];