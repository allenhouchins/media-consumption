import dotenv from 'dotenv';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KOMGA_URL = process.env.KOMGA_URL || 'http://192.168.1.100:25600';
const KOMGA_API_KEY = process.env.KOMGA_API_KEY || 'e4710dd37ec1449cb62b90d52d78de09';

if (!KOMGA_URL || !KOMGA_API_KEY) {
  console.error('ERROR: Missing required environment variables!');
  console.error('Please set KOMGA_URL and KOMGA_API_KEY in your .env file');
  process.exit(1);
}

async function fetchBooks() {
  console.log('Fetching books from Komga...');
  
  try {
    // Fetch all books (may need pagination for large libraries)
    let allBooks = [];
    let page = 0;
    const size = 1000;
    let hasMore = true;
    
    while (hasMore) {
      // Komga uses X-API-Key header for authentication
      const response = await fetch(`${KOMGA_URL}/api/v1/books?page=${page}&size=${size}`, {
        headers: {
          'X-API-Key': KOMGA_API_KEY,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Komga API returned ${response.status}: ${response.statusText}. ${errorText}`);
      }
      
      const data = await response.json();
      const books = data.content || data || [];
      allBooks = allBooks.concat(books);
      
      // Check if there are more pages
      if (data.content && data.content.length < size) {
        hasMore = false;
      } else if (!data.content || data.content.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    }
    
    // Filter to only books with read progress
    const booksWithProgress = allBooks.filter(book => book.readProgress !== null);
    return booksWithProgress;
  } catch (error) {
    console.error('Error fetching books:', error);
    throw error;
  }
}

async function fetchSeries() {
  console.log('Fetching series from Komga...');
  
  try {
    // Fetch all series (may need pagination for large libraries)
    let allSeries = [];
    let page = 0;
    const size = 1000;
    let hasMore = true;
    
    while (hasMore) {
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
      allSeries = allSeries.concat(data.content || data || []);
      
      // Check if there are more pages
      if (data.content && data.content.length < size) {
        hasMore = false;
      } else if (!data.content || data.content.length === 0) {
        hasMore = false;
      } else {
        page++;
      }
    }
    
    return allSeries;
  } catch (error) {
    console.error('Error fetching series:', error);
    throw error;
  }
}

async function downloadCover(seriesId, coversDir) {
  const coverPath = join(coversDir, `${seriesId}.jpg`);
  
  // Skip if cover already exists
  if (existsSync(coverPath)) {
    return true; // Success - already exists
  }
  
  try {
    // Komga uses X-API-Key header for authentication
    const response = await fetch(`${KOMGA_URL}/api/v1/series/${seriesId}/thumbnail`, {
      headers: {
        'X-API-Key': KOMGA_API_KEY
      }
    });
    
    if (response.ok) {
      const imageBuffer = await response.arrayBuffer();
      writeFileSync(coverPath, Buffer.from(imageBuffer));
      return true;
    }
  } catch (err) {
    // Silently skip errors
  }
  
  return false; // Failed to download
}

async function generateStaticData() {
  try {
    // Create data directory
    const dataDir = join(__dirname, '../public/data');
    mkdirSync(dataDir, { recursive: true });
    
    // Create covers directory
    const coversDir = join(dataDir, 'covers');
    mkdirSync(coversDir, { recursive: true });
    
    const fetchStart = Date.now();
    console.log('Fetching data from Komga API...\n');
    
    // Fetch books (with read progress) and series
    const [books, series] = await Promise.all([
      fetchBooks(),
      fetchSeries()
    ]);
    
    // Create a map of series by ID for quick lookup
    const seriesMap = new Map();
    series.forEach(s => {
      seriesMap.set(s.id, s);
    });
    
    // Combine books with read progress and series metadata
    const comicData = books.map(book => {
      const seriesInfo = seriesMap.get(book.seriesId);
      const readProgress = book.readProgress || {};
      
      // Extract date from readProgress (lastReadAt or completedAt)
      const readDate = readProgress.lastReadAt || readProgress.completedAt || null;
      const watchDate = readDate ? new Date(readDate).toISOString() : null;
      
      return {
        id: book.id,
        seriesId: book.seriesId,
        seriesTitle: seriesInfo?.name || book.seriesTitle || 'Unknown',
        title: seriesInfo?.name || book.seriesTitle || 'Unknown',
        bookTitle: book.name || book.metadata?.title || 'Unknown',
        bookNumber: book.number || book.metadata?.number || null,
        readProgress: readProgress,
        watchDate: watchDate,
        year: readDate ? new Date(readDate).getFullYear() : null,
        seriesMetadata: seriesInfo?.metadata || {},
        bookMetadata: book.metadata || {},
      };
    });
    
    // Download unique covers
    console.log('Downloading comic book covers...');
    const coversStart = Date.now();
    const uniqueSeries = new Set(comicData.map(c => c.seriesId));
    
    let downloaded = 0;
    let skipped = 0;
    
    // Download covers in parallel batches
    const batchSize = 10;
    const seriesIds = Array.from(uniqueSeries);
    
    for (let i = 0; i < seriesIds.length; i += batchSize) {
      const batch = seriesIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(seriesId => downloadCover(seriesId, coversDir))
      );
      
      for (const success of results) {
        if (success) {
          downloaded++;
        } else {
          skipped++;
        }
      }
      
      // Log progress every batch
      if ((i + batchSize) % 50 === 0 || i + batchSize >= seriesIds.length) {
        console.log(`  Progress: ${Math.min(i + batchSize, seriesIds.length)}/${seriesIds.length} covers processed (${downloaded} downloaded, ${skipped} skipped)...`);
      }
    }
    const coversTime = ((Date.now() - coversStart) / 1000).toFixed(2);
    console.log(`  Downloaded ${downloaded} covers, skipped ${skipped} (${coversTime}s)`);
    
    const comicDataWithMetadata = {
      response: {
        data: {
          data: comicData
        }
      },
      _metadata: {
        lastFetched: new Date().toISOString(),
        itemCount: comicData.length
      }
    };
    
    writeFileSync(
      join(dataDir, 'comic-books.json'),
      JSON.stringify(comicDataWithMetadata, null, 2)
    );
    const totalTime = ((Date.now() - fetchStart) / 1000).toFixed(2);
    console.log(`✓ Comic books data saved (${comicDataWithMetadata._metadata.itemCount} items, ${totalTime}s)`);
    
    console.log(`\n✓ Static data generation complete! (Total: ${totalTime}s)`);
    console.log(`Data saved to: ${dataDir}`);
    console.log(`\n💡 Tip: Run this script daily to keep data fresh.`);
  } catch (error) {
    console.error('Failed to generate static data:', error);
    process.exit(1);
  }
}

generateStaticData();


