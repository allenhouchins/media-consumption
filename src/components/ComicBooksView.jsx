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
          let readDate;
          if (typeof comic.lastRead === 'number') {
            readDate = new Date(comic.lastRead);
          } else if (typeof comic.lastRead === 'string') {
            readDate = new Date(comic.lastRead);
          } else if (typeof comic.date === 'number') {
            readDate = new Date(comic.date * 1000);
          } else if (typeof comic.date === 'string') {
            readDate = new Date(comic.date);
          } else {
            readDate = new Date();
          }
          const watchYear = readDate.getFullYear();
          const releaseYear = comic.year || comic.seriesMetadata?.releaseYear || null;
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
            date: readDate.getTime(), // For sorting compatibility
            year: watchYear, // Keep watch year for filtering by watch date
            releaseYear, // Preserve release year for filtering top 3 by release date
            poster: posterUrl,
            title: comicTitle,
            rating_key: comic.seriesId || comic.id, // Use seriesId as rating_key for consistency
            seriesId: comic.seriesId || comic.id,
          };
        });

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

  // Get top 3 ranked comic books for a year (based on when they were read, not release year)
  const getTop3ForYear = useMemo(() => {
    return (year) => {
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      
      // Create a map of read years by rating_key from all read data
      // This tracks when each comic series was read (not when it was released)
      const readYearsByRatingKey = new Map();
      
      // Check allReadData first (has all comics before deduplication)
      if (allReadData && allReadData.length > 0) {
        allReadData.forEach(comic => {
          const key = comic.seriesId || comic.rating_key;
          if (key) {
            // Get the read year from watchDate or year field
            const readYear = comic.watchDate ? comic.watchDate.getFullYear() : (comic.year || null);
            if (readYear !== null && readYear !== undefined) {
              // Keep the most recent read year for each series
              const existing = readYearsByRatingKey.get(key);
              if (!existing || readYear > existing) {
                readYearsByRatingKey.set(key, readYear);
              }
            }
          }
        });
      }
      
      // Also check the deduplicated comics list as a fallback
      if (comics && comics.length > 0) {
        comics.forEach(comic => {
          const key = comic.seriesId || comic.rating_key;
          if (key) {
            const readYear = comic.watchDate ? comic.watchDate.getFullYear() : (comic.year || null);
            if (readYear !== null && readYear !== undefined) {
              const existing = readYearsByRatingKey.get(key);
              if (!existing || readYear > existing) {
                readYearsByRatingKey.set(key, readYear);
              }
            }
          }
        });
      }
      
      // Filter rankings to only include comics that were READ in this year, then take top 3
      const yearRankings = rankings
        .filter(r => {
          if (!r.rating_key) return false;
          const readYear = readYearsByRatingKey.get(r.rating_key);
          // Only include if we found a read year and it matches the target year
          return readYear !== undefined && readYear === targetYear;
        })
        .slice(0, 3);
      
      return yearRankings;
    };
  }, [rankings, comics, allReadData]);

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


