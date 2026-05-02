// api/youtube.js
// Fetches recent videos from the Thrust Cinema YouTube channel using the
// official YouTube Data API v3. Returns Shorts + regular videos with
// thumbnails, view counts, and durations.
//
// Required env var: YOUTUBE_API_KEY (set in Vercel dashboard)

const CHANNEL_ID = 'UCGG_r-KeU3UH_XeJ1EcwUsw'; // Thrust Cinema
const MAX_RESULTS = 12; // how many recent videos to fetch

// Simple in-memory cache (per Vercel function instance)
let cache = { data: null, timestamp: 0, error: null, errorTimestamp: 0 };
const SUCCESS_TTL = 10 * 60 * 1000;  // 10 minutes
const ERROR_TTL = 30 * 1000;         // 30 seconds — fail fast, recover fast

// Convert ISO 8601 duration (PT1M30S) to seconds, then format as M:SS
function formatDuration(iso) {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Pick the best available thumbnail (maxres if available, else high)
function pickThumbnail(thumbnails) {
  if (!thumbnails) return '';
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    ''
  );
}

async function fetchYouTubeVideos(apiKey) {
  // Step 1: Get recent video IDs from the search endpoint (newest first)
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('key', apiKey);
  searchUrl.searchParams.set('channelId', CHANNEL_ID);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('order', 'date');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('maxResults', String(MAX_RESULTS));

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Search API ${searchRes.status}: ${text.slice(0, 200)}`);
  }
  const searchData = await searchRes.json();
  const videoIds = (searchData.items || [])
    .map(item => item.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    return [];
  }

  // Step 2: Get full details (duration, view count, better thumbnails) for those IDs
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('key', apiKey);
  videosUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
  videosUrl.searchParams.set('id', videoIds.join(','));

  const videosRes = await fetch(videosUrl.toString());
  if (!videosRes.ok) {
    const text = await videosRes.text();
    throw new Error(`Videos API ${videosRes.status}: ${text.slice(0, 200)}`);
  }
  const videosData = await videosRes.json();

  return (videosData.items || []).map(v => {
    const durationSec = (() => {
      const m = v.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return 0;
      return (parseInt(m[1] || 0, 10) * 3600) +
             (parseInt(m[2] || 0, 10) * 60) +
             (parseInt(m[3] || 0, 10));
    })();

    return {
      id: v.id,
      title: v.snippet?.title || '',
      description: v.snippet?.description || '',
      published: v.snippet?.publishedAt || '',
      thumbnail: pickThumbnail(v.snippet?.thumbnails),
      duration: formatDuration(v.contentDetails?.duration),
      durationSeconds: durationSec,
      isShort: durationSec > 0 && durationSec <= 60,
      viewCount: parseInt(v.statistics?.viewCount || 0, 10),
      likeCount: parseInt(v.statistics?.likeCount || 0, 10),
      link: `https://www.youtube.com/watch?v=${v.id}`,
      shortLink: `https://www.youtube.com/shorts/${v.id}`,
    };
  });
}

export default async function handler(req, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'YOUTUBE_API_KEY environment variable not set in Vercel',
      items: [],
    });
  }

  const now = Date.now();

  // Serve cached success if fresh
  if (cache.data && (now - cache.timestamp) < SUCCESS_TTL) {
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({ items: cache.data, cached: true, count: cache.data.length });
  }

  // Serve cached error if fresh (avoids hammering API on repeated failures)
  if (cache.error && (now - cache.errorTimestamp) < ERROR_TTL) {
    return res.status(200).json({ error: cache.error, items: [], cached: true });
  }

  try {
    const items = await fetchYouTubeVideos(apiKey);
    cache = { data: items, timestamp: now, error: null, errorTimestamp: 0 };
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({ items, count: items.length });
  } catch (err) {
    const errMsg = err.message || String(err);
    cache.error = errMsg;
    cache.errorTimestamp = now;
    return res.status(200).json({ error: errMsg, items: [] });
  }
}
