import dotenv from 'dotenv';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TAUTULLI_URL = process.env.TAUTULLI_URL;
const API_KEY = process.env.TAUTULLI_API_KEY;
const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

const postersDir = join(__dirname, '../public/data/posters');

// Movies/TV shows to download
// Set isTVShow: true for TV shows, false (or omit) for movies
const movies = [
  { rating_key: 15539, title: 'Back to the Beginning', thumb: '/library/metadata/15539/thumb/1751939655', isTVShow: false, searchTerm: 'Black Sabbath Back to the Beginning' }
];

async function downloadPoster(ratingKey, thumbPath, title) {
  const posterPath = join(postersDir, `${ratingKey}.jpg`);
  
  console.log(`\nAttempting to download poster for: ${title} (rating_key: ${ratingKey})`);
  
  // Skip if poster already exists
  if (existsSync(posterPath)) {
    console.log(`  ✓ Poster already exists: ${posterPath}`);
    return true;
  }
  
  if (!thumbPath) {
    console.log(`  ✗ No thumb path available`);
    return false;
  }
  
  // Try Tautulli's image proxy first
  try {
    console.log(`  Trying Tautulli image proxy...`);
    const tautulliImageUrl = `${TAUTULLI_URL}/api/v2?apikey=${API_KEY}&cmd=get_pms_image&img=${encodeURIComponent(thumbPath)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(tautulliImageUrl, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const imageBuffer = await response.arrayBuffer();
      writeFileSync(posterPath, Buffer.from(imageBuffer));
      console.log(`  ✓ Successfully downloaded from Tautulli: ${posterPath}`);
      return true;
    } else {
      console.log(`  ✗ Tautulli returned status: ${response.status}`);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.log(`  ✗ Tautulli error: ${err.message}`);
    } else {
      console.log(`  ✗ Tautulli request timed out`);
    }
  }
  
  // Fallback: Try Plex direct access
  if (PLEX_URL && PLEX_TOKEN && PLEX_TOKEN !== 'your_plex_token_here') {
    try {
      console.log(`  Trying Plex direct access...`);
      let plexUrl = `${PLEX_URL}${thumbPath}`;
      if (PLEX_TOKEN) {
        plexUrl += `?X-Plex-Token=${PLEX_TOKEN}`;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(plexUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const imageBuffer = await response.arrayBuffer();
        writeFileSync(posterPath, Buffer.from(imageBuffer));
        console.log(`  ✓ Successfully downloaded from Plex: ${posterPath}`);
        return true;
      } else {
        console.log(`  ✗ Plex returned status: ${response.status}`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.log(`  ✗ Plex error: ${err.message}`);
      } else {
        console.log(`  ✗ Plex request timed out`);
      }
    }
  } else {
    console.log(`  ✗ Plex credentials not configured`);
  }
  
  return false;
}

async function downloadFromInternet(ratingKey, title, isTVShow = false, searchTerm = null) {
  console.log(`\nSearching for poster online: ${title}`);
  
  // Use custom search term if provided, otherwise use title
  const searchQuery = searchTerm || title;
  
  // Try TMDB - search for TV shows or movies depending on type
  try {
    // Try TMDB search - use TV search for TV shows, movie search for movies
    const searchType = isTVShow ? 'tv' : 'movie';
    console.log(`  Searching TMDB ${searchType} for: ${searchQuery}`);
    const searchUrl = `https://api.themoviedb.org/3/search/${searchType}?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(searchQuery)}`;
    
    const searchResponse = await fetch(searchUrl);
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.results && searchData.results.length > 0) {
        // Find the best match (usually the first result, but check for exact title match)
        let bestMatch = searchData.results[0];
        const normalizedTitle = title.toLowerCase().trim();
        
        // Try to find exact title match
        for (const result of searchData.results) {
          const resultTitle = (result.name || result.title || '').toLowerCase().trim();
          if (resultTitle === normalizedTitle) {
            bestMatch = result;
            break;
          }
        }
        
        const posterPath = bestMatch.poster_path;
        
        if (posterPath) {
          const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
          console.log(`  Found poster on TMDB: ${posterUrl}`);
          console.log(`  Match: ${bestMatch.name || bestMatch.title} (${bestMatch.first_air_date || bestMatch.release_date || 'unknown date'})`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const imageResponse = await fetch(posterUrl, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const posterPath = join(postersDir, `${ratingKey}.jpg`);
            writeFileSync(posterPath, Buffer.from(imageBuffer));
            console.log(`  ✓ Successfully downloaded from TMDB: ${posterPath}`);
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.log(`  ✗ TMDB search failed: ${err.message}`);
  }
  
  return false;
}

async function main() {
  if (!TAUTULLI_URL || !API_KEY) {
    console.error('ERROR: Missing required environment variables!');
    console.error('Please set TAUTULLI_URL and TAUTULLI_API_KEY in your .env file');
    process.exit(1);
  }
  
  console.log('Downloading specific movie posters...\n');
  
  for (const movie of movies) {
    const success = await downloadPoster(movie.rating_key, movie.thumb, movie.title);
    
    if (!success) {
      console.log(`\nPlex download failed, trying internet search...`);
      await downloadFromInternet(movie.rating_key, movie.title, movie.isTVShow || false, movie.searchTerm || null);
    }
  }
  
  console.log('\n✓ Done!');
}

main().catch(console.error);

