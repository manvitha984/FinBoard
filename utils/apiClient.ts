import { adaptiveCache } from './adaptiveCache';
import { smartRateLimiter } from './smartRateLimiter';

export type FetchResult = {
  ok: boolean;
  data: any;
  message: string;
  cached?: boolean;
  learningMode?: boolean;
  quotaInfo?: {
    requestCount: number;
    requestsThisMinute: number;
    maxPerMinute: number;
    isThrottled: boolean;
    retryAfter?: number;
    detectedLimit?: string;
    consecutiveErrors?: number;
  };
};

function isExternalUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const currentHost = typeof window !== 'undefined' ? window.location.host : 'localhost';
    return parsedUrl.host !== currentHost;
  } catch {
    return false;
  }
}

function getFetchUrl(url: string): string {
  if (isExternalUrl(url)) {
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export async function fetchJson(url: string): Promise<FetchResult> {
  try {
    new URL(url);
  } catch {
    return {
      ok: false,
      data: null,
      message: 'Invalid URL format. Please include https:// or http://',
    };
  }

  // ALWAYS check rate limit status first to reset counters if minute passed
  const rateLimitCheck = smartRateLimiter.canMakeRequest(url);
  const quota = smartRateLimiter.getStatus(url);
  const limits = smartRateLimiter.getLimits();

  // Check cache first
  const cachedData = adaptiveCache.get(url);
  if (cachedData !== null) {
    return {
      ok: true,
      data: cachedData,
      message: 'Success (cached)',
      cached: true,
      quotaInfo: {
        requestCount: quota.requestCount,
        requestsThisMinute: quota.requestsThisMinute,
        maxPerMinute: limits.maxRequestsPerMinute,
        isThrottled: false,
        detectedLimit: quota.detectedLimits
          ? `${quota.detectedLimits.requestsPerMinute}/min (${quota.detectedLimits.remainingCalls} remaining)`
          : 'Unknown',
        consecutiveErrors: quota.consecutiveErrors,
      },
    };
  }

  // Rate limit check (already done above, just use the result)
  if (!rateLimitCheck.allowed) {
    const cachedFallback = adaptiveCache.getEvenIfExpired(url);

    const waitSeconds = (rateLimitCheck.retryAfter && !isNaN(rateLimitCheck.retryAfter))
      ? rateLimitCheck.retryAfter
      : 60;

    if (cachedFallback !== null) {
      return {
        ok: true,
        data: cachedFallback,
        message: `${rateLimitCheck.reason || 'Rate limited'} (using cached data)`,
        cached: true,
        quotaInfo: {
          requestCount: quota.requestCount,
          requestsThisMinute: quota.requestsThisMinute,
          maxPerMinute: limits.maxRequestsPerMinute,
          isThrottled: true,
          retryAfter: waitSeconds,
          detectedLimit: quota.detectedLimits
            ? `${quota.detectedLimits.requestsPerMinute}/min`
            : 'Unknown',
        },
      };
    }

    return {
      ok: false,
      data: null,
      message: rateLimitCheck.reason || `Rate limited. Please wait ${waitSeconds}s`,
      quotaInfo: {
        requestCount: quota.requestCount,
        requestsThisMinute: quota.requestsThisMinute,
        maxPerMinute: limits.maxRequestsPerMinute,
        isThrottled: true,
        retryAfter: waitSeconds,
        consecutiveErrors: quota.consecutiveErrors,
      },
    };
  }

  // Proceed with HTTP call
  try {
    const fetchUrl = getFetchUrl(url);
    const response = await fetch(fetchUrl);

    smartRateLimiter.recordSuccess(url);
    smartRateLimiter.learnFromHeaders(url, response.headers);

    // Get updated quota after recording success
    const updatedQuota = smartRateLimiter.getStatus(url);

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader) : 60;
        const safeRetryAfter = isNaN(retryAfter) ? 60 : retryAfter;

        smartRateLimiter.handleRateLimitError(url, safeRetryAfter);

        const cachedFallback = adaptiveCache.getEvenIfExpired(url);

        if (cachedFallback !== null) {
          return {
            ok: true,
            data: cachedFallback,
            message: `API rate limited (using cached data)`,
            cached: true,
            quotaInfo: {
              requestCount: updatedQuota.requestCount,
              requestsThisMinute: updatedQuota.requestsThisMinute,
              maxPerMinute: limits.maxRequestsPerMinute,
              isThrottled: true,
              retryAfter: safeRetryAfter,
            },
          };
        }

        return {
          ok: false,
          data: null,
          message: `Rate limited by API. Please wait ${safeRetryAfter} seconds`,
          quotaInfo: {
            requestCount: updatedQuota.requestCount,
            requestsThisMinute: updatedQuota.requestsThisMinute,
            maxPerMinute: limits.maxRequestsPerMinute,
            isThrottled: true,
            retryAfter: safeRetryAfter,
          },
        };
      }

      let errorMessage = '';
      switch (response.status) {
        case 400: errorMessage = 'Bad Request - Check your API URL and parameters'; break;
        case 401: errorMessage = 'Unauthorized - API key may be required or invalid'; break;
        case 403: errorMessage = 'Forbidden - Access denied to this resource'; break;
        case 404: errorMessage = 'Not Found - API endpoint does not exist'; break;
        case 500: errorMessage = 'Server Error - API is experiencing issues'; break;
        case 503: errorMessage = 'Service Unavailable - API is temporarily down'; break;
        default: errorMessage = `HTTP ${response.status} - ${response.statusText}`;
      }

      smartRateLimiter.recordError(url);
      return { ok: false, data: null, message: errorMessage };
    }

    const contentType = response.headers.get('content-type');
    let data: any;

    if (contentType?.includes('application/json')) {
      try {
        const jsonResponse = await response.json();
        data = isExternalUrl(url) && jsonResponse.data !== undefined
          ? jsonResponse.data
          : jsonResponse;
      } catch {
        smartRateLimiter.recordError(url);
        return { ok: false, data: null, message: 'Invalid JSON response from API' };
      }
    } else if (contentType?.includes('text/html')) {
      smartRateLimiter.recordError(url);
      return { ok: false, data: null, message: 'Received HTML instead of JSON. Check if the URL is correct.' };
    } else {
      data = await response.text();
    }

    await adaptiveCache.set(url, data);

    const finalQuota = smartRateLimiter.getStatus(url);
    const profile = adaptiveCache.getProfile(url);
    const isLearning = profile ? profile.samples.length < 5 : true;

    return {
      ok: true,
      data,
      message: 'Success',
      cached: false,
      learningMode: isLearning,
      quotaInfo: {
        requestCount: finalQuota.requestCount,
        requestsThisMinute: finalQuota.requestsThisMinute,
        maxPerMinute: limits.maxRequestsPerMinute,
        isThrottled: false,
        consecutiveErrors: finalQuota.consecutiveErrors,
      },
    };
  } catch (error) {
    console.error('Fetch error:', error);
    smartRateLimiter.recordError(url);

    const cachedFallback = adaptiveCache.getEvenIfExpired(url);
    if (cachedFallback !== null) {
      const errorQuota = smartRateLimiter.getStatus(url);
      return {
        ok: true,
        data: cachedFallback,
        message: 'Network error (using cached data)',
        cached: true,
        quotaInfo: {
          requestCount: errorQuota.requestCount,
          requestsThisMinute: errorQuota.requestsThisMinute,
          maxPerMinute: limits.maxRequestsPerMinute,
          isThrottled: false,
          consecutiveErrors: errorQuota.consecutiveErrors,
        },
      };
    }

    let errorMessage = 'Network error';
    if (error instanceof TypeError) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - Check your internet connection or CORS policy';
      } else if (error.message.includes('NetworkError')) {
        errorMessage = 'Network error - Unable to reach the API';
      } else {
        errorMessage = 'Invalid URL or network issue';
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return { ok: false, data: null, message: errorMessage };
  }
}

export const cacheControl = {
  invalidate: (url: string) => adaptiveCache.invalidate(url),
  clear: () => adaptiveCache.clear(),
  getStats: () => adaptiveCache.getStats(),
  getProfile: (url: string) => adaptiveCache.getProfile(url),
};

export const quotaControl = {
  getStatus: (url: string) => smartRateLimiter.getStatus(url),
  getAllStatuses: () => smartRateLimiter.getAllStatuses(),
  setCustomRetry: (url: string, seconds: number) =>
    smartRateLimiter.setCustomRetryTime(url, seconds),
  reset: (url: string) => smartRateLimiter.reset(url),
  resetAll: () => smartRateLimiter.resetAll(),
};