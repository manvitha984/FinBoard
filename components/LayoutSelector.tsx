"use client";
import { useState } from "react";
import { layoutTemplates, LayoutStyle } from "@/data/layoutTemplates";
import { useLayoutStore } from "@/store/layoutStore";

export default function LayoutSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { currentLayout, setLayout } = useLayoutStore();
  
  const currentTemplate = layoutTemplates.find((t) => t.id === currentLayout);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] border border-[var(--card-border)] text-[var(--text-primary)] rounded-lg transition-colors text-sm font-medium"
        title="Change dashboard layout"
      >
        <span>{currentTemplate?.icon || "📐"}</span>
        <span className="hidden sm:inline">Layout</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card-header)]">
              <h3 className="font-semibold text-[var(--text-primary)]">Dashboard Layout</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Choose how widgets are displayed</p>
            </div>
            
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {layoutTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setLayout(template.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-all ${
                    currentLayout === template.id
                      ? "bg-blue-600/10 border border-blue-500/30"
                      : "hover:bg-[var(--hover-bg)] border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{template.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${
                          currentLayout === template.id 
                            ? "text-blue-600 dark:text-blue-400" 
                            : "text-[var(--text-primary)]"
                        }`}>
                          {template.name}
                        </span>
                        {currentLayout === template.id && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                        {template.description}
                      </p>
                      
                      {/* Layout Preview Mini */}
                      <div className="mt-2 flex gap-1">
                        <LayoutPreviewMini template={template} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LayoutPreviewMini({ template }: { template: typeof layoutTemplates[0] }) {
  const { cardSize, gap } = template.preview;
  
  // Visual representation of the layout
  const boxSize = cardSize === "sm" ? "w-2 h-2" : cardSize === "lg" ? "w-4 h-3" : "w-3 h-2.5";
  const gapSize = gap === "gap-2" ? "gap-0.5" : gap === "gap-6" ? "gap-1.5" : "gap-1";
  
  return (
    <div className={`flex ${gapSize} p-1.5 bg-[var(--hover-bg)] rounded border border-[var(--card-border)]`}>
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`${boxSize} bg-[var(--text-muted)]/30 rounded-sm`}
        />
      ))}
    </div>
  );
}