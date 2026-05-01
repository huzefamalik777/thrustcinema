// ============================================================
// Vercel Serverless Function: /api/youtube
// ============================================================
// Fetches the latest videos from a YouTube channel's public RSS
// feed and returns them as clean JSON. No API key required.
//
// Why this exists:
// - YouTube's RSS feed doesn't allow browser fetches (no CORS)
// - Third-party RSS converters now require API keys / paid plans
// - This function runs server-side on Vercel's free tier and
//   acts as our own little proxy, with edge caching for speed.
//
// Deployment: Just push this file to your repo at /api/youtube.js
// and Vercel auto-deploys it. No config needed.
//
// Endpoint becomes: https://thrustcinema.com/api/youtube
// ============================================================

const CHANNEL_ID = 'UCGG_r-KeU3UH_XeJ1EcwUsw'; // @thrustcinema

export default async function handler(req, res) {
  // Cache for 10 minutes at the edge so we don't hit YouTube on every request.
  // Adjust if you upload very frequently and want faster updates.
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
    const response = await fetch(rssUrl, {
      headers: {
        // YouTube blocks requests without a recognizable User-Agent.
        // Vercel's default fetch UA gets 403, so we identify as a browser.
        'User-Agent': 'Mozilla/5.0 (compatible; ThrustCinemaBot/1.0; +https://thrustcinema.com)',
        'Accept': 'application/atom+xml, application/xml, text/xml'
      }
    });
    if (!response.ok) throw new Error(`YouTube RSS responded ${response.status}`);
    const xml = await response.text();

    const items = parseYouTubeRSS(xml);
    res.status(200).json({ items, count: items.length });
  } catch (err) {
    console.error('youtube api error:', err);
    res.status(500).json({ error: err.message, items: [] });
  }
}

function parseYouTubeRSS(xml) {
  const items = [];
  // Simple regex-based parser. RSS XML is structured enough that this is
  // safer than pulling in a full XML library, which Vercel functions don't
  // include by default.
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
