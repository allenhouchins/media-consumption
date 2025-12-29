import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// All credentials must be set via environment variables
const TAUTULLI_URL = process.env.TAUTULLI_URL;
const API_KEY = process.env.TAUTULLI_API_KEY;
const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const KOMGA_URL = process.env.KOMGA_URL || 'http://192.168.1.100:25600';
const KOMGA_API_KEY = process.env.KOMGA_API_KEY || 'e4710dd37ec1449cb62b90d52d78de09';

// Validate required environment variables
if (!TAUTULLI_URL || !API_KEY) {
  console.error('ERROR: Missing required environment variables!');
  console.error('Please set TAUTULLI_URL and TAUTULLI_API_KEY in your .env file');
  console.error('See .env.example for reference');
  process.exit(1);
}

// Proxy endpoint to get history (movies or TV shows)
app.get('/api/history', async (req, res) => {
  const startTime = Date.now();
  try {
    const { media_type } = req.query;
    
    // Build the URL with proper query parameters
    // Using a large length to get all history, but this can be slow
    let url = `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_history&length=10000`;
    
    // Add media_type filter if specified
    if (media_type) {
      url += `&media_type=${media_type}`;
    } else {
      // Default to movie if not specified
      url += '&media_type=movie';
    }
    
    console.log(`[${media_type || 'movie'}] Fetching from Tautulli...`);
    
    // Add timeout to prevent hanging requests (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    try {
      const fetchStart = Date.now();
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      const fetchTime = Date.now() - fetchStart;
      console.log(`[${media_type || 'movie'}] Tautulli response received in ${fetchTime}ms`);
      
      if (!response.ok) {
        throw new Error(`Tautulli API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const parseTime = Date.now() - fetchStart - fetchTime;
      console.log(`[${media_type || 'movie'}] JSON parsed in ${parseTime}ms`);
      
      // Filter results on the backend to ensure correct media type
      if (data.response?.data?.data && media_type) {
        data.response.data.data = data.response.data.data.filter(
          item => item.media_type === media_type
        );
      }
      
      const totalTime = Date.now() - startTime;
      console.log(`[${media_type || 'movie'}] Total request time: ${totalTime}ms (${data.response?.data?.data?.length || 0} items)`);
      
      res.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error(`[${media_type || 'movie'}] Request timeout after 60 seconds`);
        res.status(504).json({ error: 'Request timeout - Tautulli server is taking too long to respond' });
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[${req.query.media_type || 'movie'}] Error fetching history (${totalTime}ms):`, error.message);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Proxy endpoint to get metadata for a specific movie
app.get('/api/metadata/:ratingKey', async (req, res) => {
  try {
    const { ratingKey } = req.params;
    const response = await fetch(
      `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_metadata&rating_key=${ratingKey}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// Proxy endpoint to serve Plex poster images
// This handles authentication and CORS issues
// Accepts thumb path as a query parameter or rating key
app.get('/api/poster', async (req, res) => {
  try {
    const { thumb, ratingKey } = req.query;
    
    let thumbPath = thumb;
    
    // If no thumb path provided, try to get it from rating key
    if (!thumbPath && ratingKey) {
      const metadataResponse = await fetch(
        `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_metadata&rating_key=${ratingKey}`
      );
      const metadataData = await metadataResponse.json();
      thumbPath = metadataData.response?.data?.thumb;
    }
    
    if (!thumbPath) {
      return res.status(404).json({ error: 'Poster not found' });
    }
    
    // Try Tautulli's image proxy first (if available)
    try {
      const tautulliImageUrl = `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_pms_image&img=${encodeURIComponent(thumbPath)}`;
      const tautulliResponse = await fetch(tautulliImageUrl);
      
      if (tautulliResponse.ok) {
        const imageBuffer = await tautulliResponse.arrayBuffer();
        const contentType = tautulliResponse.headers.get('content-type') || 'image/jpeg';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        return res.send(Buffer.from(imageBuffer));
      } else {
        console.log(`Tautulli image proxy returned ${tautulliResponse.status} for ${thumbPath.substring(0, 50)}...`);
      }
    } catch (err) {
      // Fall through to Plex direct access
      console.log(`Tautulli image proxy error for ${thumbPath.substring(0, 50)}...:`, err.message);
    }
    
    // Fallback: Construct Plex URL
    let plexUrl = `${PLEX_URL}${thumbPath}`;
    if (PLEX_TOKEN && PLEX_TOKEN !== 'your_plex_token_here') {
      plexUrl += `?X-Plex-Token=${PLEX_TOKEN}`;
    } else if (!PLEX_TOKEN || PLEX_TOKEN === 'your_plex_token_here') {
      // If no valid Plex token, return error with helpful message
      console.error(`Plex token not set or is placeholder. Cannot fetch from Plex: ${thumbPath.substring(0, 50)}...`);
      return res.status(503).json({ 
        error: 'Poster unavailable - Plex token not configured. Tautulli proxy failed and Plex requires authentication.' 
      });
    }
    
    // Fetch the image from Plex and proxy it
    const imageResponse = await fetch(plexUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to fetch poster from Plex: ${imageResponse.status} ${imageResponse.statusText} for ${thumbPath.substring(0, 50)}...`);
      if (imageResponse.status === 401) {
        console.error('Plex authentication failed. Check PLEX_TOKEN in .env file.');
      }
      return res.status(404).json({ error: 'Poster not found' });
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('Error proxying poster:', error);
    res.status(500).json({ error: 'Failed to fetch poster' });
  }
});

// Rankings API endpoints
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rankingsDir = join(__dirname, 'public', 'data');

// Ensure rankings directory exists
mkdirSync(rankingsDir, { recursive: true });

// Get rankings file path
const getRankingsPath = (contentType) => {
  if (contentType === 'tv') {
    return join(rankingsDir, 'tv-rankings.json');
  } else if (contentType === 'comics') {
    return join(rankingsDir, 'comic-rankings.json');
  } else {
    return join(rankingsDir, 'movie-rankings.json');
  }
};

// GET rankings
app.get('/api/rankings/:contentType', (req, res) => {
  try {
    const { contentType } = req.params;
    console.log(`[GET] Rankings request for: ${contentType}`);
    const filePath = getRankingsPath(contentType);
    
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8');
      const rankings = JSON.parse(data);
      console.log(`[GET] Returning ${rankings.length} rankings for ${contentType}`);
      res.json(rankings);
    } else {
      console.log(`[GET] Rankings file not found for ${contentType}, returning empty array`);
      res.json([]); // Return empty array if file doesn't exist
    }
  } catch (error) {
    console.error('Error reading rankings:', error);
    res.status(500).json({ error: 'Failed to read rankings' });
  }
});

// POST rankings (save)
app.post('/api/rankings/:contentType', (req, res) => {
  try {
    const { contentType } = req.params;
    console.log(`[POST] Save rankings request for: ${contentType}`);
    const rankings = req.body;
    
    if (!rankings) {
      console.error('[POST] No rankings data in request body');
      return res.status(400).json({ error: 'No rankings data provided' });
    }
    
    // Validate rankings is an array
    if (!Array.isArray(rankings)) {
      console.error('[POST] Rankings is not an array:', typeof rankings);
      return res.status(400).json({ error: 'Rankings must be an array' });
    }
    
    const filePath = getRankingsPath(contentType);
    console.log(`[POST] Saving ${rankings.length} rankings to: ${filePath}`);
    
    // Save to file
    writeFileSync(filePath, JSON.stringify(rankings, null, 2), 'utf8');
    console.log(`[POST] ✓ Rankings saved successfully for ${contentType}: ${rankings.length} items`);
    
    res.json({ success: true, count: rankings.length });
  } catch (error) {
    console.error('[POST] Error saving rankings:', error);
    res.status(500).json({ error: 'Failed to save rankings', details: error.message });
  }
});

// Komga API endpoints
// Get books with read progress from Komga
app.get('/api/komga/read-progress', async (req, res) => {
  try {
    // Fetch books and filter for those with read progress
    const { page = 0, size = 1000 } = req.query;
    // Komga uses X-API-Key header for authentication
    const response = await fetch(`${KOMGA_URL}/api/v1/books?page=${page}&size=${size}`, {
      headers: {
        'X-API-Key': KOMGA_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Komga API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const books = data.content || data || [];
    // Filter to only books with read progress
    const booksWithProgress = books.filter(book => book.readProgress !== null);
    res.json(booksWithProgress);
  } catch (error) {
    console.error('Error fetching Komga read progress:', error);
    res.status(500).json({ error: 'Failed to fetch read progress', details: error.message });
  }
});

// Get series from Komga
app.get('/api/komga/series', async (req, res) => {
  try {
    const { page = 0, size = 1000 } = req.query;
    // Komga uses X-API-Key header for authentication
    const response = await fetch(`${KOMGA_URL}/api/v1/series?page=${page}&size=${size}`, {
      headers: {
        'X-API-Key': KOMGA_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Komga API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Komga series:', error);
    res.status(500).json({ error: 'Failed to fetch series', details: error.message });
  }
});

// Get comic book cover/thumbnail
app.get('/api/komga/cover/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    // Komga uses X-API-Key header for authentication
    const response = await fetch(`${KOMGA_URL}/api/v1/series/${seriesId}/thumbnail`, {
      headers: {
        'X-API-Key': KOMGA_API_KEY
      }
    });
    
    if (!response.ok) {
      return res.status(404).json({ error: 'Cover not found' });
    }
    
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(Buffer.from(imageBuffer));
  } catch (error) {
    console.error('Error fetching Komga cover:', error);
    res.status(500).json({ error: 'Failed to fetch cover' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

