
export interface APIQuota {
  url: string;
  requestCount: number;
  requestsThisMinute: number;
  requestsThisHour: number;
  minuteStartTime: number;
  hourStartTime: number;
  lastRequestTime: number;
  throttledUntil: number | null;
  detectedLimits?: {
    requestsPerMinute?: number;
    remainingCalls?: number;
    resetTime?: number;
  };
  customRetryAfter?: number;
  consecutiveErrors: number;
}

const STORAGE_KEY = 'finboard_rate_limiter';

export class SmartRateLimiter {
  private quotas: Map<string, APIQuota> = new Map();

  private readonly LIMITS = {
    maxRequestsPerMinute: 30,    
    maxRequestsPerHour: 200,     
    minDelayBetweenRequests: 500, 
    maxConsecutiveErrors: 3,
    backoffMultiplier: 1.5,
  };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as Record<string, APIQuota>;
        Object.entries(data).forEach(([url, quota]) => {
          if (quota.throttledUntil && Date.now() > quota.throttledUntil) {
            quota.throttledUntil = null;
          }
          if (Date.now() - quota.minuteStartTime > 60000) {
            quota.requestsThisMinute = 0;
            quota.minuteStartTime = Date.now();
          }
          if (Date.now() - quota.hourStartTime > 3600000) {
            quota.requestsThisHour = 0;
            quota.hourStartTime = Date.now();
          }
          this.quotas.set(url, quota);
        });
        console.log(`📊 Loaded ${this.quotas.size} API quotas from storage`);
      }
    } catch (err) {
      console.warn('Failed to load rate limiter data:', err);
    }
  }

 
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const data: Record<string, APIQuota> = {};
      this.quotas.forEach((quota, url) => {
        data[url] = quota;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save rate limiter data:', err);
    }
  }


  canMakeRequest(url: string): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const quota = this.getOrCreateQuota(url);
    const now = Date.now();

    if (now - quota.minuteStartTime > 60000) {
      quota.requestsThisMinute = 0;
      quota.minuteStartTime = now;
      this.saveToStorage();
    }

    if (now - quota.hourStartTime > 3600000) {
      quota.requestsThisHour = 0;
      quota.hourStartTime = now;
      this.saveToStorage();
    }

    if (quota.throttledUntil && now < quota.throttledUntil) {
      const waitSeconds = Math.ceil((quota.throttledUntil - now) / 1000);
      return {
        allowed: false,
        reason: `API rate limited. Retry in ${waitSeconds}s`,
        retryAfter: waitSeconds,
      };
    }

    if (quota.requestsThisMinute >= this.LIMITS.maxRequestsPerMinute) {
      const waitSeconds = Math.ceil((quota.minuteStartTime + 60000 - now) / 1000);
      return {
        allowed: false,
        reason: `Minute limit reached (${this.LIMITS.maxRequestsPerMinute}/min). Wait ${waitSeconds}s`,
        retryAfter: waitSeconds,
      };
    }

    if (quota.requestsThisHour >= this.LIMITS.maxRequestsPerHour) {
      const waitSeconds = Math.ceil((quota.hourStartTime + 3600000 - now) / 1000);
      return {
        allowed: false,
        reason: `Hourly limit reached (${this.LIMITS.maxRequestsPerHour}/hr). Wait ${Math.ceil(waitSeconds / 60)}min`,
        retryAfter: waitSeconds,
      };
    }

    const timeSinceLastRequest = now - quota.lastRequestTime;
    if (timeSinceLastRequest < this.LIMITS.minDelayBetweenRequests) {
      const waitMs = this.LIMITS.minDelayBetweenRequests - timeSinceLastRequest;
      return {
        allowed: false,
        reason: `Too fast. Wait ${waitMs}ms`,
        retryAfter: Math.ceil(waitMs / 1000),
      };
    }

    if (quota.consecutiveErrors >= this.LIMITS.maxConsecutiveErrors) {
      const backoffDelay = Math.pow(
        this.LIMITS.backoffMultiplier,
        quota.consecutiveErrors - this.LIMITS.maxConsecutiveErrors
      ) * 5000;

      const waitSeconds = Math.ceil(backoffDelay / 1000);
      return {
        allowed: false,
        reason: `Too many errors. Backing off for ${waitSeconds}s`,
        retryAfter: waitSeconds,
      };
    }

    return { allowed: true };
  }

 
  recordSuccess(url: string): void {
    const quota = this.getOrCreateQuota(url);
    const now = Date.now();

    if (now - quota.minuteStartTime > 60000) {
      quota.requestsThisMinute = 0;
      quota.minuteStartTime = now;
    }
    if (now - quota.hourStartTime > 3600000) {
      quota.requestsThisHour = 0;
      quota.hourStartTime = now;
    }

    quota.requestCount++;
    quota.requestsThisMinute++;
    quota.requestsThisHour++;
    quota.lastRequestTime = now;
    quota.consecutiveErrors = 0;
    quota.throttledUntil = null;

    this.saveToStorage();

    console.log(
      `✅ [${this.getDomain(url)}] Request #${quota.requestCount} (${quota.requestsThisMinute}/${this.LIMITS.maxRequestsPerMinute} this min)`
    );
  }

  
  recordError(url: string): void {
    const quota = this.getOrCreateQuota(url);
    quota.consecutiveErrors++;
    quota.lastRequestTime = Date.now();

    this.saveToStorage();

    console.warn(
      `❌ [${this.getDomain(url)}] Error #${quota.consecutiveErrors}`
    );
  }

  
  handleRateLimitError(url: string, retryAfterSeconds: number = 60): void {
    const quota = this.getOrCreateQuota(url);
    quota.throttledUntil = Date.now() + retryAfterSeconds * 1000;
    quota.consecutiveErrors = 0;

    this.saveToStorage();

    console.warn(
      `⚠️ [${this.getDomain(url)}] Rate limited! Backing off for ${retryAfterSeconds}s`
    );
  }


  learnFromHeaders(url: string, headers: Headers): void {
    const quota = this.getOrCreateQuota(url);

    const patterns = [
      { limit: 'x-ratelimit-limit', remaining: 'x-ratelimit-remaining', reset: 'x-ratelimit-reset' },
      { limit: 'ratelimit-limit', remaining: 'ratelimit-remaining', reset: 'ratelimit-reset' },
      { limit: 'x-rate-limit-limit', remaining: 'x-rate-limit-remaining', reset: 'x-rate-limit-reset' },
    ];

    for (const pattern of patterns) {
      const limitHeader = headers.get(pattern.limit);
      const remainingHeader = headers.get(pattern.remaining);
      const resetHeader = headers.get(pattern.reset);

      if (limitHeader && remainingHeader) {
        const limit = parseInt(limitHeader);
        const remaining = parseInt(remainingHeader);

        quota.detectedLimits = {
          requestsPerMinute: limit,
          remainingCalls: remaining,
          resetTime: resetHeader ? parseInt(resetHeader) * 1000 : undefined,
        };

        this.saveToStorage();

        if (remaining <= 0) {
          const resetTime = resetHeader ? parseInt(resetHeader) : 60;
          this.handleRateLimitError(url, resetTime);
        }

        return;
      }
    }
  }

 
  setCustomRetryTime(url: string, delaySeconds: number): void {
    const quota = this.getOrCreateQuota(url);
    quota.customRetryAfter = delaySeconds;
    quota.throttledUntil = Date.now() + delaySeconds * 1000;
    this.saveToStorage();
    console.log(`✅ Custom retry set: ${delaySeconds}s for ${this.getDomain(url)}`);
  }

  
  getStatus(url: string): APIQuota {
    return this.getOrCreateQuota(url);
  }

  
  getAllStatuses(): Map<string, APIQuota> {
    return new Map(this.quotas);
  }

  
  getLimits() {
    return { ...this.LIMITS };
  }

 
  reset(url: string): void {
    this.quotas.delete(url);
    this.saveToStorage();
    console.log(`🔄 Quota reset for ${this.getDomain(url)}`);
  }

  
  resetAll(): void {
    this.quotas.clear();
    this.saveToStorage();
    console.log('🔄 All quotas reset');
  }


  private getOrCreateQuota(url: string): APIQuota {
    if (!this.quotas.has(url)) {
      const now = Date.now();
      this.quotas.set(url, {
        url,
        requestCount: 0,
        requestsThisMinute: 0,
        requestsThisHour: 0,
        minuteStartTime: now,
        hourStartTime: now,
        lastRequestTime: 0,
        throttledUntil: null,
        consecutiveErrors: 0,
      });
    }
    return this.quotas.get(url)!;
  }

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url.slice(0, 30);
    }
  }
}

export const smartRateLimiter = new SmartRateLimiter();