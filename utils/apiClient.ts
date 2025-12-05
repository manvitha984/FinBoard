// utils/apiClient.ts
import { adaptiveCache } from './adaptiveCache';

export type FetchResult = {
  ok: boolean;
  data: any;
  message: string;
  cached?: boolean;
  learningMode?: boolean;
};

export async function fetchJson(url: string): Promise<FetchResult> {
  // Validate URL format
  try {
    new URL(url);
  } catch {
    return {
      ok: false,
      data: null,
      message: 'Invalid URL format. Please include https:// or http://',
    };
  }

  // Try cache first
  const cachedData = adaptiveCache.get(url);
  if (cachedData !== null) {
    return {
      ok: true,
      data: cachedData,
      message: 'Success (cached)',
      cached: true,
    };
  }

  // Fetch from API
  try {
    const response = await fetch(url);

    if (!response.ok) {
      // Handle specific HTTP status codes with friendly messages
      let errorMessage = '';
      
      switch (response.status) {
        case 400:
          errorMessage = 'Bad Request - Check your API URL and parameters';
          break;
        case 401:
          errorMessage = 'Unauthorized - API key may be required or invalid';
          break;
        case 403:
          errorMessage = 'Forbidden - Access denied to this resource';
          break;
        case 404:
          errorMessage = 'Not Found - API endpoint does not exist. Did you include https://?';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded - Too many requests';
          break;
        case 500:
          errorMessage = 'Server Error - API is experiencing issues';
          break;
        case 503:
          errorMessage = 'Service Unavailable - API is temporarily down';
          break;
        default:
          errorMessage = `HTTP ${response.status} - ${response.statusText}`;
      }
      
      return {
        ok: false,
        data: null,
        message: errorMessage,
      };
    }

    const contentType = response.headers.get('content-type');
    let data: any;

    if (contentType?.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        return {
          ok: false,
          data: null,
          message: 'Invalid JSON response from API',
        };
      }
    } else if (contentType?.includes('text/html')) {
      // Detect if we got an HTML error page instead of API data
      return {
        ok: false,
        data: null,
        message: 'Received HTML instead of JSON. Check if the URL is correct and includes https://',
      };
    } else {
      data = await response.text();
    }

    // Learn from this data and cache it
    await adaptiveCache.set(url, data);

    const profile = adaptiveCache.getProfile(url);
    const isLearning = profile ? profile.samples.length < 5 : true;

    return {
      ok: true,
      data,
      message: 'Success',
      cached: false,
      learningMode: isLearning,
    };
  } catch (error) {
    console.error('Fetch error:', error);
    
    // Handle specific error types
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
    
    return {
      ok: false,
      data: null,
      message: errorMessage,
    };
  }
}

// Export cache controls
export const cacheControl = {
  invalidate: (url: string) => adaptiveCache.invalidate(url),
  clear: () => adaptiveCache.clear(),
  getStats: () => adaptiveCache.getStats(),
  getProfile: (url: string) => adaptiveCache.getProfile(url),
};