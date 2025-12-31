import { useState, useEffect, useMemo, useRef } from 'react';
import '../App.css';
import MovieList from './MovieList';
import RankingTab from './RankingTab';
import AdminRankingTab from './AdminRankingTab';
import AdminLogin from './AdminLogin';
import { API_BASE_URL, IS_DEV, STATIC_DATA_PATH } from '../config';
import { cache } from '../utils/cache';

function ComicBooksView({ onNavigate }) {
  const [comics, setComics] = useState([]);
  const [allReadData, setAllReadData] = useState([]); // Store all read instances for accurate calculations
  const [rankings, setRankings] = useState([]); // Store rankings for Top 3 display
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Initialize activeTab from URL or default to 'current'
  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'ranking' || tab === 'admin') {
      return tab;
    }
    if (tab) {
      return tab; // Could be a year like '2024'
    }
    return 'current';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [years, setYears] = useState([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return localStorage.getItem('adminAuthenticated') === 'true';
  });
  const fetchingRef = useRef(false); // Prevent duplicate fetches (React StrictMode)

  // Update URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'comics');
    if (activeTab === 'current') {
      // For 'current', use the actual current year in URL
      const currentYear = new Date().getFullYear();
      params.set('tab', currentYear.toString());
    } else {
      params.set('tab', activeTab);
    }
    const newUrl = `?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab]);

  useEffect(() => {
    if (!fetchingRef.current) {
      fetchingRef.current = true;
      fetchComicBooks();
    }
  }, []);

  // Load rankings for Top 3 display
  useEffect(() => {
    const loadRankings = async () => {
      try {
        const cacheKey = `rankings-comics`;
        const cachedRankings = await cache.get(cacheKey);
        if (cachedRankings) {
          setRankings(cachedRankings);
          return;
        }
        
        let rankingsData = [];
        if (IS_DEV) {
          const response = await fetch(`${API_BASE_URL}/rankings/comics`);
          if (response.ok) {
            rankingsData = await response.json();
          }
        } else {
          const response = await fetch(`${STATIC_DATA_PATH}/comic-rankings.json`);
          if (response.ok) {
            rankingsData = await response.json();
          }
        }
        
        const restoredRankings = rankingsData.map(r => ({
          ...r,
          watchDate: r.watchDate ? new Date(r.watchDate) : new Date()
        }));
        setRankings(restoredRankings);
        await cache.set(cacheKey, restoredRankings);
      } catch (e) {
        console.error('Error loading rankings for Top 3:', e);
      }
    };
    
    loadRankings();
    
    // Listen for rankings updates
    const handleRankingsSaved = (e) => {
      // Only reload if it's for comics
      if (!e.detail || !e.detail.contentType || e.detail.contentType === 'comics') {
        // Clear cache for rankings and reload fresh data
        const cacheKey = `rankings-comics`;
        // Clear from IndexedDB
        cache.clear().then(() => {
          // Reload rankings
          loadRankings();
        }).catch(() => {
          // If cache clear fails, just reload
          loadRankings();
        });
      }
    };
    window.addEventListener('rankingsSaved', handleRankingsSaved);
    
    return () => {
      window.removeEventListener('rankingsSaved', handleRankingsSaved);
    };
  }, []);

  const fetchComicBooks = async () => {
    try {
      setLoading(true);
      const startTime = performance.now();
      
      // Check cache first
      const cacheKey = IS_DEV ? 'comics-dev' : 'comics-prod';
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        console.log(`Using cached data for comic books (${cachedData.processed?.length || 0} comics)`);
        setComics(cachedData.processed);
        setAllReadData(cachedData.allReadData);
        setYears(cachedData.years);
        setLoading(false);
        
        // Set active tab from URL if valid, otherwise default
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        if (urlTab && (urlTab === 'ranking' || urlTab === 'admin' || cachedData.years.includes(parseInt(urlTab)))) {
          // URL tab is valid, keep it
          setActiveTab(urlTab === new Date().getFullYear().toString() ? 'current' : urlTab);
        } else {
          // No valid URL tab, set default
          const currentYear = new Date().getFullYear();
          if (cachedData.years.includes(currentYear)) {
            setActiveTab('current');
          } else if (cachedData.years.length > 0) {
            setActiveTab(cachedData.years[0].toString());
          }
        }
        console.log(`Comic books loaded from cache in ${(performance.now() - startTime).toFixed(2)}ms`);
        return;
      }
      
      console.log('Loading comic books from static data file...');
      const fetchStart = performance.now();
      // Always use static JSON files (both dev and production)
      // Run 'npm run fetch-data' to update the data
      const response = await fetch(`${STATIC_DATA_PATH}/comic-books.json`);
      if (!response.ok) {
        throw new Error(`Failed to load comic books data: ${response.status} ${response.statusText}. Please run 'npm run fetch-data' to generate the data files.`);
      }
      const data = await response.json();
      const fetchTime = performance.now() - fetchStart;
      console.log(`Static file fetch took ${fetchTime.toFixed(2)}ms`);
      
      // Check if data is stale (older than 24 hours)
      if (data._metadata?.lastFetched) {
        const lastFetched = new Date(data._metadata.lastFetched);
        const hoursSinceFetch = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);
        if (hoursSinceFetch > 24) {
          console.warn(`⚠️ Comic book data is ${Math.round(hoursSinceFetch)} hours old. Run 'npm run fetch-data' to update.`);
        } else {
          console.log(`✓ Data is fresh (fetched ${Math.round(hoursSinceFetch)} hours ago)`);
        }
      }
      
      // Handle different possible response structures
      const comicData = data.response?.data?.data || data.data || data.readProgress || [];
      console.log(`Processing ${comicData.length} comic book reads...`);
      const processStart = performance.now();
      
      if (comicData.length > 0) {
        
        // Process comic books
        const processedComics = comicData.map((comic) => {
          // Handle date - could be Unix timestamp or ISO string
          // Check multiple possible date fields
          let readDate;
          if (typeof comic.date === 'number') {
            // Unix timestamp in seconds (from fetch script)
            readDate = new Date(comic.date * 1000);
          } else if (typeof comic.lastRead === 'number') {
            readDate = new Date(comic.lastRead);
          } else if (typeof comic.lastRead === 'string') {
            readDate = new Date(comic.lastRead);
          } else if (typeof comic.watchDate === 'string') {
            readDate = new Date(comic.watchDate);
          } else if (comic.readProgress?.readDate) {
            // Fallback to readProgress.readDate
            readDate = new Date(comic.readProgress.readDate);
          } else if (comic.readProgress?.lastReadAt) {
            readDate = new Date(comic.readProgress.lastReadAt);
          } else if (comic.readProgress?.completedAt) {
            readDate = new Date(comic.readProgress.completedAt);
          } else {
            // Only use today's date as last resort - log warning
            console.warn(`No read date found for comic: ${comic.title || comic.seriesTitle || 'Unknown'}`);
            readDate = null; // Set to null instead of today to avoid false dates
          }
          
          // If we still don't have a valid date, skip this comic
          if (!readDate || isNaN(readDate.getTime())) {
            return null;
          }
          const watchYear = readDate.getFullYear();
          
          // Extract issue release year from bookMetadata.releaseDate or parse from title
          let issueReleaseYear = null;
          if (comic.bookMetadata?.releaseDate) {
            issueReleaseYear = new Date(comic.bookMetadata.releaseDate).getFullYear();
          } else if (comic.bookTitle) {
            // Try to extract year from title like "House of Slaughter 001 (2021)"
            const yearMatch = comic.bookTitle.match(/\((\d{4})\)/);
            if (yearMatch) {
              issueReleaseYear = parseInt(yearMatch[1]);
            }
          }
          
          // Fallback to series release year if issue release year not available
          const releaseYear = issueReleaseYear || comic.year || comic.seriesMetadata?.releaseYear || null;
          const comicTitle = comic.seriesTitle || comic.title || comic.name || 'Unknown';
          
          // Use the cover/thumbnail from Komga
          let posterUrl = null;
          if (comic.seriesId || comic.id) {
            const seriesId = comic.seriesId || comic.id;
            // Try local static cover file first (works in both dev and prod)
            posterUrl = `${STATIC_DATA_PATH}/covers/${seriesId}.jpg`;
          }
          
          // In development, if we don't have a local file, fallback to backend proxy
          if (IS_DEV && (comic.seriesId || comic.id) && !posterUrl) {
            const seriesId = comic.seriesId || comic.id;
            posterUrl = `${API_BASE_URL}/komga/cover/${seriesId}`;
          }
          
          return {
            ...comic,
            watchDate: readDate,
            date: Math.floor(readDate.getTime() / 1000), // Unix timestamp in seconds for sorting compatibility
            year: watchYear, // Keep watch year for filtering by watch date
            releaseYear, // Issue release year (or series release year as fallback)
            issueReleaseYear, // Specific issue release year (null if not available)
            readYear: watchYear, // Year the issue was read
            poster: posterUrl,
            title: comicTitle,
            rating_key: comic.seriesId || comic.id, // Use seriesId as rating_key for consistency
            seriesId: comic.seriesId || comic.id,
            bookId: comic.id, // Keep book ID to track individual issues
          };
        }).filter(comic => comic !== null); // Filter out comics with invalid dates

        // Sort by read date (most recent first)
        processedComics.sort((a, b) => b.date - a.date);
        
        // Store all read data for accurate calculations
        setAllReadData(processedComics);
        
        // Deduplicate comics by seriesId - keep only the most recent read for each series
        const comicsBySeriesId = new Map();
        processedComics.forEach(comic => {
          const key = comic.seriesId || comic.rating_key;
          if (!key) {
            return;
          }
          
          const existing = comicsBySeriesId.get(key);
          if (!existing) {
            // First occurrence of this series
            comicsBySeriesId.set(key, comic);
          } else {
            // Keep the one with the most recent read date
            const comicTime = comic.watchDate ? comic.watchDate.getTime() : (comic.date || 0);
            const existingTime = existing.watchDate ? existing.watchDate.getTime() : (existing.date || 0);
            if (comicTime > existingTime) {
              comicsBySeriesId.set(key, comic);
            }
          }
        });
        
        // Convert back to array
        const deduplicatedComics = Array.from(comicsBySeriesId.values());
        
        // Sort again by read date (most recent first)
        deduplicatedComics.sort((a, b) => b.watchDate - a.watchDate);
        
        // Extract unique years from deduplicated comics
        const uniqueYears = [...new Set(deduplicatedComics.map(c => c.year))].sort((a, b) => b - a);
        
        console.log(`Processing took ${(performance.now() - processStart).toFixed(2)}ms`);
        
        // Cache the processed data
        const cacheStart = performance.now();
        await cache.set(cacheKey, {
          processed: deduplicatedComics,
          allReadData: processedComics,
          years: uniqueYears
        });
        console.log(`Caching took ${(performance.now() - cacheStart).toFixed(2)}ms`);
        
        setComics(deduplicatedComics);
        setYears(uniqueYears);
        
        // Set active tab from URL if valid, otherwise default
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        if (urlTab && (urlTab === 'ranking' || urlTab === 'admin' || uniqueYears.includes(parseInt(urlTab)))) {
          // URL tab is valid, keep it
          setActiveTab(urlTab === new Date().getFullYear().toString() ? 'current' : urlTab);
        } else {
          // No valid URL tab, set default
          const currentYear = new Date().getFullYear();
          if (uniqueYears.includes(currentYear)) {
            setActiveTab('current');
          } else if (uniqueYears.length > 0) {
            setActiveTab(uniqueYears[0].toString());
          }
        }
        
        console.log(`Total comic books load time: ${(performance.now() - startTime).toFixed(2)}ms`);
      } else {
        setError('No comic book data found');
      }
    } catch (err) {
      console.error('Error fetching comic books:', err);
      if (err.message && err.message.includes('Failed to load comic books data')) {
        setError(err.message);
      } else {
        setError('Failed to load comic books data. Please run "npm run fetch-data" to generate the data files.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getComicsByYear = useMemo(() => {
    return (year) => {
      if (year === 'current') {
        const currentYear = new Date().getFullYear();
        return comics.filter(c => c.year === currentYear);
      }
      return comics.filter(c => c.year === parseInt(year));
    };
  }, [comics]);

  // Get top 3 ranked comic books for a year
  // Only includes comics where: (1) an issue was released that year AND (2) that issue was read that year
  const getTop3ForYear = useMemo(() => {
    return (year) => {
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      
      // Create a set of series (rating_key) that have at least one issue that meets both criteria:
      // 1. Issue was released in the target year
      // 2. Issue was read in the target year
      const eligibleSeries = new Set();
      
      // Check allReadData (has all individual issues before deduplication)
      if (allReadData && allReadData.length > 0) {
        allReadData.forEach(comic => {
          const key = comic.seriesId || comic.rating_key;
          if (!key) return;
          
          // Get the read year
          const readYear = comic.readYear || (comic.watchDate ? comic.watchDate.getFullYear() : (comic.year || null));
          
          // Get the issue release year - only use explicit issueReleaseYear, not series fallback
          // We need to verify that a specific issue was released that year, not just the series
          const issueReleaseYear = comic.issueReleaseYear !== null && comic.issueReleaseYear !== undefined 
            ? comic.issueReleaseYear 
            : null;
          
          // Both conditions must be met:
          // 1. Issue was read in the target year
          // 2. Issue was released in the target year (must have explicit issueReleaseYear)
          if (readYear === targetYear && issueReleaseYear !== null && issueReleaseYear === targetYear) {
            eligibleSeries.add(key);
          }
        });
      }
      
      // Filter rankings to only include series that have at least one eligible issue, then take top 3
      const yearRankings = rankings
        .filter(r => {
          if (!r.rating_key) return false;
          // Only include if the series has at least one issue that meets both criteria
          return eligibleSeries.has(r.rating_key);
        })
        .slice(0, 3);
      
      return yearRankings;
    };
  }, [rankings, allReadData]);

  const getYearStats = useMemo(() => {
    // Pre-compute format function
    const formatReadTime = (issues) => {
      if (!issues || issues === 0) return '0 issues';
      return `${issues} issue${issues !== 1 ? 's' : ''}`;
    };
    
    return (year) => {
      const yearComics = getComicsByYear(year);
      
      // Count unique series (deduplicated by seriesId)
      const uniqueSeries = new Set(yearComics.map(c => c.seriesId || c.rating_key));
      const count = uniqueSeries.size;
      
      // Calculate total issues read from ALL read instances (not deduplicated)
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      const allYearReads = allReadData.filter(c => {
        const readYear = c.watchDate ? c.watchDate.getFullYear() : new Date(c.date || 0).getFullYear();
        return readYear === targetYear;
      });
      
      const totalIssues = allYearReads.length;
      
      return {
        count,
        totalIssues,
        totalReadTime: formatReadTime(totalIssues)
      };
    };
  }, [comics, allReadData, getComicsByYear]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading comic books...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <button className="home-button" onClick={() => onNavigate('home')}>
            ← Home
          </button>
          <div className="nav-buttons">
            <button className="switch-button" onClick={() => onNavigate('movies')}>
              🎬 Movies
            </button>
            <button className="switch-button" onClick={() => onNavigate('tv')}>
              📺 TV Shows
            </button>
          </div>
        </div>
        <h1>Comic Books</h1>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'current' ? 'active' : ''}`}
          onClick={() => setActiveTab('current')}
        >
          {new Date().getFullYear()}
        </button>
        {years.map(year => (
          year !== new Date().getFullYear() && (
            <button
              key={year}
              className={`tab ${activeTab === year.toString() ? 'active' : ''}`}
              onClick={() => setActiveTab(year.toString())}
            >
              {year}
            </button>
          )
        ))}
        <button
          className={`tab ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          Rankings
        </button>
        {IS_DEV && (
          <button
            className={`tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            Admin
          </button>
        )}
      </div>

      <div className="tab-content">
        {activeTab === 'ranking' ? (
          <RankingTab movies={comics} contentType="comics" />
        ) : activeTab === 'admin' && IS_DEV ? (
          isAdminAuthenticated ? (
            <AdminRankingTab movies={comics} contentType="comics" />
          ) : (
            <AdminLogin onLogin={() => setIsAdminAuthenticated(true)} />
          )
        ) : (
          <>
            {(() => {
              const stats = getYearStats(activeTab);
              const top3 = getTop3ForYear(activeTab);
              return (
                <div className="year-stats">
                  <div className="stat-item">
                    <span className="stat-label">Series Read:</span>
                    <span className="stat-value">{stats.count}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Issues Read:</span>
                    <span className="stat-value">{stats.totalIssues}</span>
                  </div>
                  {top3.map((item, index) => {
                    // Build poster URL - try local static files first, fallback to backend proxy in dev
                    let posterUrl = null;
                    if (item.rating_key) {
                      // Try local static cover file first (works in both dev and prod)
                      posterUrl = `${STATIC_DATA_PATH}/covers/${item.rating_key}.jpg`;
                    }
                    
                    // In development, if we don't have a local file, fallback to backend proxy
                    if (IS_DEV && item.rating_key && !posterUrl) {
                      posterUrl = `${API_BASE_URL}/komga/cover/${item.rating_key}`;
                    } else if (item.poster && !item.poster.includes('localhost')) {
                      // Fallback to stored poster if it's not a localhost URL
                      posterUrl = item.poster;
                    }
                    
                    return (
                      <div key={item.rating_key || index} className="stat-item top-3-stat-item">
                        <span className="stat-label">#{index + 1}</span>
                        <div className="top-3-content">
                          {posterUrl && (
                            <img 
                              src={posterUrl} 
                              alt={item.title}
                              className="top-3-poster"
                              loading="lazy"
                              onError={(e) => {
                                // Try fallback with rating_key if available
                                if (item.rating_key) {
                                  if (IS_DEV) {
                                    e.target.src = `${API_BASE_URL}/komga/cover/${item.rating_key}`;
                                    return;
                                  }
                                }
                                // Final fallback
                                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="90"%3E%3Crect fill="%23ddd" width="60" height="90"/%3E%3C/svg%3E';
                              }}
                            />
                          )}
                          <span className="stat-value top-3-value">{item.title}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <MovieList movies={getComicsByYear(activeTab)} contentType="comics" />
          </>
        )}
      </div>
    </div>
  );
}

export default ComicBooksView;


