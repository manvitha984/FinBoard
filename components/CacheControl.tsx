"use client";
import { useState, useEffect } from "react";
import { cacheControl } from "@/utils/apiClient";

export default function CacheControl() {
  const [stats, setStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);

  function updateStats() {
    const cacheStats = cacheControl.getStats();
    setStats(cacheStats);
    setShowStats(true);
  }

  useEffect(() => {
    if (!showStats) return;
    
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, [showStats]);

  function clearCache() {
    cacheControl.clear();
    updateStats();
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={updateStats}
        className="px-4 py-2 bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] rounded-lg shadow-lg border border-[var(--card-border)] text-[var(--text-primary)] text-sm flex items-center gap-2 transition-colors"
      >
        🧠 Adaptive Cache
        {stats && (
          <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">
            {stats.trackedAPIs}
          </span>
        )}
      </button>

      {showStats && (
        <div className="absolute bottom-12 right-0 w-[600px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl p-4 max-h-[600px] overflow-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[var(--text-primary)]">Adaptive Cache Intelligence</h3>
            <button
              onClick={() => setShowStats(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              ✖
            </button>
          </div>

          {stats && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-[var(--hover-bg)] p-3 rounded border border-[var(--card-border)]">
                  <div className="text-xs text-[var(--text-muted)]">Cached Items</div>
                  <div className="text-2xl font-semibold text-green-500">
                    {stats.cacheSize}
                  </div>
                </div>
                <div className="bg-[var(--hover-bg)] p-3 rounded border border-[var(--card-border)]">
                  <div className="text-xs text-[var(--text-muted)]">Tracked APIs</div>
                  <div className="text-2xl font-semibold text-blue-500">
                    {stats.trackedAPIs}
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-sm font-semibold text-[var(--text-secondary)]">API Profiles</div>
                {stats.profiles.map((profile: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-[var(--hover-bg)] p-3 rounded border border-[var(--card-border)] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-[var(--text-primary)] truncate flex-1">
                        {profile.url}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          profile.pattern === 'Realtime'
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400'
                            : profile.pattern === 'Periodic'
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                            : 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400'
                        }`}
                      >
                        {profile.pattern}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-[var(--text-muted)]">
                      <div>
                        <div>Updates</div>
                        <div className="text-[var(--text-primary)] font-semibold">
                          {profile.updateFrequency}
                        </div>
                      </div>
                      <div>
                        <div>Cache TTL</div>
                        <div className="text-[var(--text-primary)] font-semibold">{profile.ttl}</div>
                      </div>
                      <div>
                        <div>Confidence</div>
                        <div className="text-[var(--text-primary)] font-semibold">
                          {profile.confidence}
                        </div>
                      </div>
                      <div>
                        <div>Samples</div>
                        <div className="text-[var(--text-primary)] font-semibold">
                          {profile.samples}/20
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={clearCache}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
              >
                🗑️ Clear All Cache
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}