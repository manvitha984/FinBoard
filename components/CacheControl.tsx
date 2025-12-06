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
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg shadow-lg border border-gray-700 text-white text-sm flex items-center gap-2"
      >
        🧠 Adaptive Cache
        {stats && (
          <span className="bg-green-600 px-2 py-0.5 rounded text-xs">
            {stats.trackedAPIs}
          </span>
        )}
      </button>

      {showStats && (
        <div className="absolute bottom-12 right-0 w-[600px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-4 max-h-[600px] overflow-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Adaptive Cache Intelligence</h3>
            <button
              onClick={() => setShowStats(false)}
              className="text-gray-400 hover:text-white"
            >
              ✖
            </button>
          </div>

          {stats && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">Cached Items</div>
                  <div className="text-2xl font-semibold text-green-400">
                    {stats.cacheSize}
                  </div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">Tracked APIs</div>
                  <div className="text-2xl font-semibold text-blue-400">
                    {stats.trackedAPIs}
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="text-sm font-semibold text-gray-300">API Profiles</div>
                {stats.profiles.map((profile: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-800 p-3 rounded space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-white truncate flex-1">
                        {profile.url}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          profile.pattern === 'Realtime'
                            ? 'bg-red-900/50 text-red-400'
                            : profile.pattern === 'Periodic'
                            ? 'bg-blue-900/50 text-blue-400'
                            : 'bg-green-900/50 text-green-400'
                        }`}
                      >
                        {profile.pattern}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs text-gray-400">
                      <div>
                        <div>Updates</div>
                        <div className="text-white font-semibold">
                          {profile.updateFrequency}
                        </div>
                      </div>
                      <div>
                        <div>Cache TTL</div>
                        <div className="text-white font-semibold">{profile.ttl}</div>
                      </div>
                      <div>
                        <div>Confidence</div>
                        <div className="text-white font-semibold">
                          {profile.confidence}
                        </div>
                      </div>
                      <div>
                        <div>Samples</div>
                        <div className="text-white font-semibold">
                          {profile.samples}/20
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={clearCache}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
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