const CACHE_STORAGE_KEY = 'finboard_cache';
const PROFILE_STORAGE_KEY = 'finboard_cache_profiles';

export interface DataSnapshot {
  hash: string;
  timestamp: number;
  value: any;
}

export interface APIProfile {
  url: string;
  updateFrequency: number | null;
  samples: DataSnapshot[];
  lastCheck: number;
  confidence: number;
  isRealtime: boolean;
  recommendedTTL: number;
}

interface CacheEntry {
  data: any;
  expiration: number;
}

export class AdaptiveCache {
  private cache: Map<string, any> = new Map();
  private apiProfiles: Map<string, APIProfile> = new Map();
  private expirations: Map<string, number> = new Map();

  private readonly MIN_SAMPLES = 5;
  private readonly MAX_SAMPLES = 20;
  private readonly MIN_TTL = 5 * 1000;
  private readonly MAX_TTL = 24 * 60 * 60 * 1000;
  private readonly DEFAULT_TTL = 60 * 1000;

  constructor() {
    this.loadFromStorage();
  }

 
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const savedCache = localStorage.getItem(CACHE_STORAGE_KEY);
      if (savedCache) {
        const data = JSON.parse(savedCache) as Record<string, CacheEntry>;
        const now = Date.now();

        Object.entries(data).forEach(([url, entry]) => {
          this.cache.set(url, entry.data);
          this.expirations.set(url, entry.expiration);
        });
        console.log(`📦 Loaded ${this.cache.size} cached items from storage`);
      }

      const savedProfiles = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (savedProfiles) {
        const profiles = JSON.parse(savedProfiles) as Record<string, APIProfile>;
        Object.entries(profiles).forEach(([url, profile]) => {
          this.apiProfiles.set(url, profile);
        });
        console.log(`📊 Loaded ${this.apiProfiles.size} API profiles from storage`);
      }
    } catch (err) {
      console.warn('Failed to load cache from storage:', err);
    }
  }

  
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const cacheData: Record<string, CacheEntry> = {};
      this.cache.forEach((data, url) => {
        const expiration = this.expirations.get(url) || Date.now() + this.DEFAULT_TTL;
        cacheData[url] = { data, expiration };
      });
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheData));

      const profileData: Record<string, APIProfile> = {};
      this.apiProfiles.forEach((profile, url) => {
        profileData[url] = {
          ...profile,
          samples: profile.samples.slice(-5).map(s => ({
            hash: s.hash,
            timestamp: s.timestamp,
            value: null, 
          })),
        };
      });
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileData));
    } catch (err) {
      console.warn('Failed to save cache to storage:', err);
    }
  }

  
  get(url: string): any | null {
    const cached = this.cache.get(url);
    const expiration = this.expirations.get(url);

    if (!cached || !expiration) {
      return null;
    }

    if (Date.now() > expiration) {
      console.log(`⏰ Cache expired for ${this.getShortUrl(url)}`);
      return null;
    }

    console.log(`✅ Cache HIT for ${this.getShortUrl(url)}`);
    return cached;
  }


  getEvenIfExpired(url: string): any | null {
    const cached = this.cache.get(url);
    if (cached) {
      console.log(`📦 Using expired cache as fallback for ${this.getShortUrl(url)}`);
    }
    return cached || null;
  }


  async set(url: string, data: any): Promise<void> {
    await this.learnFromData(url, data);

    const ttl = this.getAdaptiveTTL(url);

    this.cache.set(url, data);
    this.expirations.set(url, Date.now() + ttl);

    this.saveToStorage();

    console.log(
      `💾 Cache SET for ${this.getShortUrl(url)} (TTL: ${this.formatDuration(ttl)})`
    );
  }

  private async learnFromData(url: string, data: any): Promise<void> {
    const hash = this.hashData(data);
    const now = Date.now();

    let profile = this.apiProfiles.get(url);
    if (!profile) {
      profile = {
        url,
        updateFrequency: null,
        samples: [],
        lastCheck: now,
        confidence: 0,
        isRealtime: false,
        recommendedTTL: this.DEFAULT_TTL,
      };
      this.apiProfiles.set(url, profile);
    }

    profile.samples.push({ hash, timestamp: now, value: data });

    if (profile.samples.length > this.MAX_SAMPLES) {
      profile.samples = profile.samples.slice(-this.MAX_SAMPLES);
    }

    if (profile.samples.length >= this.MIN_SAMPLES) {
      this.analyzeUpdatePattern(profile);
    }

    profile.lastCheck = now;
  }

  private analyzeUpdatePattern(profile: APIProfile): void {
    const { samples } = profile;
    const changes: number[] = [];

    for (let i = 1; i < samples.length; i++) {
      if (samples[i].hash !== samples[i - 1].hash) {
        const timeDiff = samples[i].timestamp - samples[i - 1].timestamp;
        changes.push(timeDiff);
      }
    }

    if (changes.length === 0) {
      profile.updateFrequency = null;
      profile.isRealtime = false;
      profile.recommendedTTL = this.MAX_TTL;
      profile.confidence = 90;
      console.log(`📊 ${this.getShortUrl(profile.url)}: STATIC data detected`);
      return;
    }

    const avgInterval = changes.reduce((a, b) => a + b, 0) / changes.length;

    const variance =
      changes.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) /
      changes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    profile.isRealtime = avgInterval < 60 * 1000;

    profile.confidence = Math.max(0, Math.min(100, 100 - coefficientOfVariation * 100));

    profile.updateFrequency = avgInterval;

    let recommendedTTL = Math.floor(avgInterval * 0.8);

    recommendedTTL = Math.max(this.MIN_TTL, Math.min(this.MAX_TTL, recommendedTTL));

    profile.recommendedTTL = recommendedTTL;

    console.log(
      `🧠 ${this.getShortUrl(profile.url)}: ` +
        `Updates every ${this.formatDuration(avgInterval)} ` +
        `(confidence: ${profile.confidence.toFixed(0)}%) ` +
        `→ TTL: ${this.formatDuration(recommendedTTL)}`
    );
  }

  private getAdaptiveTTL(url: string): number {
    const profile = this.apiProfiles.get(url);

    if (!profile) {
      return this.DEFAULT_TTL;
    }

    if (profile.confidence > 70) {
      return profile.recommendedTTL;
    }

    if (profile.isRealtime) {
      return this.MIN_TTL;
    }

    return this.DEFAULT_TTL;
  }

  private hashData(data: any): string {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return hash.toString(36);
    } catch {
      return Math.random().toString(36);
    }
  }

  private getShortUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname.substring(0, 20);
    } catch {
      return url.substring(0, 40);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
  }

  invalidate(url: string): void {
    this.cache.delete(url);
    this.expirations.delete(url);
    this.saveToStorage();
    console.log(`🗑️ Cache invalidated for ${this.getShortUrl(url)}`);
  }

  clear(): void {
    this.cache.clear();
    this.expirations.clear();
    this.saveToStorage();
    console.log('🗑️ All cache cleared');
  }

  getProfile(url: string): APIProfile | null {
    return this.apiProfiles.get(url) || null;
  }

  getAllProfiles(): APIProfile[] {
    return Array.from(this.apiProfiles.values());
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      trackedAPIs: this.apiProfiles.size,
      profiles: this.getAllProfiles().map((p) => ({
        url: this.getShortUrl(p.url),
        pattern: p.isRealtime ? 'Realtime' : p.updateFrequency ? 'Periodic' : 'Static',
        updateFrequency: p.updateFrequency ? this.formatDuration(p.updateFrequency) : 'N/A',
        ttl: this.formatDuration(p.recommendedTTL),
        confidence: `${p.confidence.toFixed(0)}%`,
        samples: p.samples.length,
      })),
    };
  }
}

export const adaptiveCache = new AdaptiveCache();