// ============================================================
// Vercel Serverless Function: /api/youtube
// ============================================================
// Fetches the latest videos from a YouTube channel's public RSS
// feed and returns them as clean JSON.
//
// HARDENED VERSION:
// - Tries multiple endpoint formats (channel RSS + uploads playlist RSS)
// - Realistic browser headers to avoid YouTube bot blocking
// - Retries on transient 4xx errors with backoff
// - Caches successful responses for 10 mins; caches errors for 30s only
//   (so a transient YouTube blip doesn't lock us out for an hour)
//
// To use a different channel, edit CHANNEL_ID below.
// ============================================================

const CHANNEL_ID = 'UCGG_r-KeU3UH_XeJ1EcwUsw'; // @thrustcinema

// YouTube has two equivalent RSS endpoints. We try the channel one first,
// then fall back to the uploads playlist (which is just channel ID with UC -> UU).
const PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);

const RSS_URLS = [
  `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
  `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`,
];

// Realistic browser-like headers to reduce YouTube bot rejection.
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/atom+xml,application/xml,text/xml,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  let lastError = null;

  // Try each endpoint, with up to 2 attempts each (4 total tries max)
  for (const url of RSS_URLS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, { headers: FETCH_HEADERS });

        if (response.ok) {
          const xml = await response.text();
          const items = parseYouTubeRSS(xml);

          if (items.length > 0) {
            // Success - cache for 10 minutes at the edge
            res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
            return res.status(200).json({ items, count: items.length });
          }
          // Empty feed - might mean no videos yet. Cache shorter.
          res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
          return res.status(200).json({ items: [], count: 0 });
        }

        lastError = `${url} responded ${response.status}`;
        // Brief backoff before retry
        if (attempt === 0) await sleep(500);
      } catch (err) {
        lastError = `${url} threw: ${err.message}`;
        if (attempt === 0) await sleep(500);
      }
    }
  }

  // All attempts failed. Cache the error response for only 30 seconds
  // so a transient YouTube blip doesn't lock the site out for 10 minutes.
  res.setHeader('Cache-Control', 's-maxage=30');
  res.status(200).json({ error: lastError || 'unknown', items: [] });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseYouTubeRSS(xml) {
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const id = pick(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = pick(entry, /<title>([^<]+)<\/title>/);
    const published = pick(entry, /<published>([^<]+)<\/published>/);
    const description = pick(entry, /<media:description>([\s\S]*?)<\/media:description>/);
    const link = `https://www.youtube.com/watch?v=${id}`;
    if (id) items.push({ id, title, published, description, link });
  }
  return items;
}

function pick(text, regex) {
  const m = text.match(regex);
  return m ? decodeXml(m[1].trim()) : '';
}

function decodeXml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
