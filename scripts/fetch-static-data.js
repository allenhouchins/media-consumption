import dotenv from 'dotenv';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TAUTULLI_URL = process.env.TAUTULLI_URL;
const API_KEY = process.env.TAUTULLI_API_KEY;
const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

if (!TAUTULLI_URL || !API_KEY) {
  console.error('ERROR: Missing required environment variables!');
  console.error('Please set TAUTULLI_URL and TAUTULLI_API_KEY in your .env file');
  process.exit(1);
}

async function fetchData(mediaType) {
  const url = `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_history&length=10000&media_type=${mediaType}`;
  console.log(`Fetching ${mediaType} data from Tautulli...`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Filter to ensure correct media type
    if (data.response?.data?.data) {
      data.response.data.data = data.response.data.data.filter(
        item => item.media_type === mediaType
      );
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${mediaType} data:`, error);
    throw error;
  }
}

async function downloadPoster(ratingKey, thumbPath, postersDir) {
  const posterPath = join(postersDir, `${ratingKey}.jpg`);
  
  // Skip if poster already exists
  if (existsSync(posterPath)) {
    return true; // Success - already exists
  }
  
  if (!thumbPath) {
    return false; // No thumb path available
  }
  
  // Download directly from Tautulli/Plex (same logic as server.js)
  try {
    // Try Tautulli's image proxy first (if available)
    try {
      const tautulliImageUrl = `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_pms_image&img=${encodeURIComponent(thumbPath)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(tautulliImageUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const imageBuffer = await response.arrayBuffer();
        writeFileSync(posterPath, Buffer.from(imageBuffer));
        return true;
      }
    } catch (err) {
      // Fall through to Plex direct access
      if (err.name !== 'AbortError') {
        console.log(`  Tautulli proxy failed for ${ratingKey}, trying Plex...`);
      }
    }
    
    // Fallback: Try Plex direct access
    if (PLEX_URL && PLEX_TOKEN && PLEX_TOKEN !== 'your_plex_token_here') {
      let plexUrl = `${PLEX_URL}${thumbPath}`;
      if (PLEX_TOKEN) {
        plexUrl += `?X-Plex-Token=${PLEX_TOKEN}`;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(plexUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const imageBuffer = await response.arrayBuffer();
        writeFileSync(posterPath, Buffer.from(imageBuffer));
        return true;
      }
    }
  } catch (err) {
    // Silently skip errors (timeouts, network issues, etc.)
    if (err.name !== 'AbortError') {
      // Only log non-timeout errors for debugging
    }
  }
  
  return false; // Failed to download
}

async function generateStaticData() {
  try {
    // Create data directory
    const dataDir = join(__dirname, '../public/data');
    mkdirSync(dataDir, { recursive: true });
    
    // Create posters directory
    const postersDir = join(dataDir, 'posters');
    mkdirSync(postersDir, { recursive: true });
    
    const fetchStart = Date.now();
    console.log('Fetching data from Tautulli API...\n');
    
    // Fetch movies
    const moviesStart = Date.now();
    const moviesData = await fetchData('movie');
    
    // Download unique movie posters
    console.log('Downloading movie posters...');
    const moviePostersStart = Date.now();
    const uniqueMovies = new Map();
    moviesData.response?.data?.data?.forEach(movie => {
      if (movie.rating_key && movie.thumb && !uniqueMovies.has(movie.rating_key)) {
        uniqueMovies.set(movie.rating_key, movie.thumb);
      }
    });
    
    let downloaded = 0;
    let skipped = 0;
    let errorCount = 0;
    
    // Download posters in parallel batches for speed
    const batchSize = 10;
    const movieEntries = Array.from(uniqueMovies.entries());
    
    for (let i = 0; i < movieEntries.length; i += batchSize) {
      const batch = movieEntries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(([ratingKey, thumbPath]) => downloadPoster(ratingKey, thumbPath, postersDir))
      );
      
      for (const success of results) {
        if (success) {
          downloaded++;
        } else {
          skipped++;
          errorCount++;
        }
      }
      
      // Log progress every batch
      if ((i + batchSize) % 50 === 0 || i + batchSize >= movieEntries.length) {
        console.log(`  Progress: ${Math.min(i + batchSize, movieEntries.length)}/${movieEntries.length} posters processed (${downloaded} downloaded, ${skipped} skipped)...`);
      }
    }
    const moviePostersTime = ((Date.now() - moviePostersStart) / 1000).toFixed(2);
    console.log(`  Downloaded ${downloaded} posters, skipped ${skipped} (${moviePostersTime}s)`);
    
    const moviesDataWithMetadata = {
      ...moviesData,
      _metadata: {
        lastFetched: new Date().toISOString(),
        itemCount: moviesData.response?.data?.data?.length || 0
      }
    };
    writeFileSync(
      join(dataDir, 'movies.json'),
      JSON.stringify(moviesDataWithMetadata, null, 2)
    );
    const moviesTime = ((Date.now() - moviesStart) / 1000).toFixed(2);
    console.log(`✓ Movies data saved (${moviesDataWithMetadata._metadata.itemCount} items, ${moviesTime}s)`);
    
    // Fetch TV shows (episodes)
    const tvStart = Date.now();
    const tvData = await fetchData('episode');
    
    // Download unique TV show posters (use grandparent_rating_key for shows)
    console.log('Downloading TV show posters...');
    const tvPostersStart = Date.now();
    const uniqueShows = new Map();
    tvData.response?.data?.data?.forEach(episode => {
      const showKey = episode.grandparent_rating_key || episode.parent_rating_key;
      const thumbPath = episode.thumb || episode.parent_thumb || episode.grandparent_thumb;
      if (showKey && thumbPath && !uniqueShows.has(showKey)) {
        uniqueShows.set(showKey, thumbPath);
      }
    });
    
    downloaded = 0;
    skipped = 0;
    errorCount = 0;
    
    // Download posters in parallel batches for speed
    const showBatchSize = 10;
    const showEntries = Array.from(uniqueShows.entries());
    
    for (let i = 0; i < showEntries.length; i += showBatchSize) {
      const batch = showEntries.slice(i, i + showBatchSize);
      const results = await Promise.all(
        batch.map(([ratingKey, thumbPath]) => downloadPoster(ratingKey, thumbPath, postersDir))
      );
      
      for (const success of results) {
        if (success) {
          downloaded++;
        } else {
          skipped++;
          errorCount++;
        }
      }
      
      // Log progress every batch
      if ((i + showBatchSize) % 50 === 0 || i + showBatchSize >= showEntries.length) {
        console.log(`  Progress: ${Math.min(i + showBatchSize, showEntries.length)}/${showEntries.length} posters processed (${downloaded} downloaded, ${skipped} skipped)...`);
      }
    }
    const tvPostersTime = ((Date.now() - tvPostersStart) / 1000).toFixed(2);
    console.log(`  Downloaded ${downloaded} posters, skipped ${skipped} (${tvPostersTime}s)`);
    
    const tvDataWithMetadata = {
      ...tvData,
      _metadata: {
        lastFetched: new Date().toISOString(),
        itemCount: tvData.response?.data?.data?.length || 0
      }
    };
    writeFileSync(
      join(dataDir, 'tv-shows.json'),
      JSON.stringify(tvDataWithMetadata, null, 2)
    );
    const tvTime = ((Date.now() - tvStart) / 1000).toFixed(2);
    console.log(`✓ TV shows data saved (${tvDataWithMetadata._metadata.itemCount} items, ${tvTime}s)`);
    
    const totalTime = ((Date.now() - fetchStart) / 1000).toFixed(2);
    console.log(`\n✓ Static data generation complete! (Total: ${totalTime}s)`);
    console.log(`Data saved to: ${dataDir}`);
    console.log(`\n💡 Tip: Run this script daily to keep data fresh.`);
  } catch (error) {
    console.error('Failed to generate static data:', error);
    process.exit(1);
  }
}

generateStaticData();

