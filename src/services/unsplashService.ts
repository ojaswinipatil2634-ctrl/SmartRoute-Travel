import axios from 'axios';

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
const CACHE_KEY_PREFIX = 'unsplash_cache_v2_';

export interface UnsplashImage {
  id: string;
  url: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

/**
 * Fetches high-quality, strictly relevant images from Unsplash.
 */
export async function fetchPlaceImages(placeName: string): Promise<UnsplashImage[]> {
  if (!UNSPLASH_ACCESS_KEY) {
    console.warn('Unsplash API key is missing. Please add VITE_UNSPLASH_ACCESS_KEY to your environment.');
    return getPlaceholders(placeName);
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${placeName.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      // Cache for 48 hours
      if (Date.now() - timestamp < 48 * 60 * 60 * 1000) {
        return data;
      }
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  // Step 2: Improved search queries
  const searchQueries = [
    `${placeName} India monument`,
    `${placeName} famous landmark`,
    `${placeName} tourism place real photo`,
    placeName
  ];

  for (const query of searchQueries) {
    try {
      console.log(`[Unsplash] Fetching for: ${query}`);
      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query,
          orientation: 'landscape',
          per_page: 10, // Fetch more to filter for relevance
          content_filter: 'high',
          order_by: 'relevant'
        },
        headers: {
          Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`
        }
      });

      console.log(`[Unsplash] Response for ${query}:`, response.data);

      if (response.data.results && response.data.results.length > 0) {
        // Step 3: Strict relevance filtering
        const filteredResults = response.data.results.filter((img: any) => {
          const searchStr = (img.description || img.alt_description || '').toLowerCase();
          const headingWords = placeName.toLowerCase().split(' ');
          // Check if at least one significant word from heading is in description
          return headingWords.some(word => word.length > 3 && searchStr.includes(word)) || 
                 searchStr.includes(placeName.toLowerCase());
        });

        const resultsToUse = filteredResults.length > 0 ? filteredResults : response.data.results;

        const images: UnsplashImage[] = resultsToUse.slice(0, 6).map((img: any) => ({
          id: img.id,
          url: img.urls.regular,
          alt: img.alt_description || placeName,
          photographer: img.user.name,
          photographerUrl: img.user.links.html
        }));

        if (images.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: images,
            timestamp: Date.now()
          }));
          return images;
        }
      }
    } catch (error: any) {
      // Step 7: Handle specific error codes
      if (error.response) {
        const status = error.response.status;
        if (status === 401) console.error('[Unsplash] 401: Unauthorized. Check your Access Key.');
        if (status === 403) console.error('[Unsplash] 403: Forbidden. Rate limit exceeded or invalid permissions.');
        if (status === 429) console.error('[Unsplash] 429: Rate limit reached.');
      }
      console.error(`[Unsplash] Search failed for query: ${query}`, error.message);
      
      // If it's a fatal error (auth/rate limit), don't keep retrying other queries
      if (error.response && [401, 403, 429].includes(error.response.status)) break;
    }
  }

  // Step 6: Final Fallback
  return getPlaceholders(placeName);
}

function getPlaceholders(placeName: string): UnsplashImage[] {
  return [
    {
      id: 'placeholder-1',
      url: `https://picsum.photos/seed/${placeName}-travel/1200/800`,
      alt: placeName,
      photographer: 'SmartRoute Travel',
      photographerUrl: '#'
    }
  ];
}
