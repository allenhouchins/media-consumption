import { useState, useEffect, useMemo, useRef } from 'react';
import '../App.css';
import MovieList from './MovieList';
import RankingTab from './RankingTab';
import AdminRankingTab from './AdminRankingTab';
import AdminLogin from './AdminLogin';
import { API_BASE_URL, IS_DEV, STATIC_DATA_PATH } from '../config';
import { cache } from '../utils/cache';

function MoviesView({ onNavigate }) {
  const [movies, setMovies] = useState([]);
  const [allWatchData, setAllWatchData] = useState([]); // Store all watch instances for accurate time calculations
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
    params.set('view', 'movies');
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
      fetchMovies();
    }
  }, []);

  // Load rankings for Top 3 display
  useEffect(() => {
    const loadRankings = async () => {
      try {
        const cacheKey = `rankings-movies`;
        const cachedRankings = await cache.get(cacheKey);
        if (cachedRankings) {
          setRankings(cachedRankings);
          return;
        }
        
        let rankingsData = [];
        if (IS_DEV) {
          const response = await fetch(`${API_BASE_URL}/rankings/movies`);
          if (response.ok) {
            rankingsData = await response.json();
          }
        } else {
          const response = await fetch(`${STATIC_DATA_PATH}/movie-rankings.json`);
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
      // Only reload if it's for movies (not TV shows)
      if (!e.detail || !e.detail.contentType || e.detail.contentType === 'movies') {
        // Clear cache for rankings and reload fresh data
        const cacheKey = `rankings-movies`;
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

  const fetchMovies = async () => {
    try {
      setLoading(true);
      const startTime = performance.now();
      
      // Check cache first
      const cacheKey = IS_DEV ? 'movies-dev' : 'movies-prod';
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        console.log(`Using cached data for movies (${cachedData.processed?.length || 0} movies)`);
        setMovies(cachedData.processed);
        setAllWatchData(cachedData.allWatchData);
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
        console.log(`Movies loaded from cache in ${(performance.now() - startTime).toFixed(2)}ms`);
        return;
      }
      
      console.log('Loading movies from static data file...');
      const fetchStart = performance.now();
      // Always use static JSON files (both dev and production)
      // Run 'npm run fetch-data' to update the data
      const response = await fetch(`${STATIC_DATA_PATH}/movies.json`);
      if (!response.ok) {
        throw new Error(`Failed to load movies data: ${response.status} ${response.statusText}. Please run 'npm run fetch-data' to generate the data files.`);
      }
      const data = await response.json();
      const fetchTime = performance.now() - fetchStart;
      console.log(`Static file fetch took ${fetchTime.toFixed(2)}ms`);
      
      // Check if data is stale (older than 24 hours)
      if (data._metadata?.lastFetched) {
        const lastFetched = new Date(data._metadata.lastFetched);
        const hoursSinceFetch = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);
        if (hoursSinceFetch > 24) {
          console.warn(`⚠️ Movie data is ${Math.round(hoursSinceFetch)} hours old. Run 'npm run fetch-data' to update.`);
        } else {
          console.log(`✓ Data is fresh (fetched ${Math.round(hoursSinceFetch)} hours ago)`);
        }
      }
      
      // Handle different possible response structures
      const movieData = data.response?.data?.data || data.response?.data || data.data || [];
      console.log(`Processing ${movieData.length} movies...`);
      const processStart = performance.now();
      
      if (movieData.length > 0) {
        
        // Process movies and use Plex posters from Tautulli
        // Use requestIdleCallback or setTimeout to break up processing
        const processedMovies = movieData.map((movie) => {
          // Handle date - could be Unix timestamp or ISO string
          let watchDate;
          if (typeof movie.date === 'number') {
            watchDate = new Date(movie.date * 1000);
          } else if (typeof movie.date === 'string') {
            watchDate = new Date(movie.date);
          } else {
            watchDate = new Date();
          }
          const year = watchDate.getFullYear();
          const movieTitle = movie.title || 'Unknown';
          
          // Use the thumb path from Tautulli to construct poster URL
          // Try local static files first (same in dev and prod), fallback to backend proxy in dev
          let posterUrl = null;
          if (movie.rating_key) {
            // Try local static poster file first (works in both dev and prod)
            // Use STATIC_DATA_PATH to account for GitHub Pages base path
            posterUrl = `${STATIC_DATA_PATH}/posters/${movie.rating_key}.jpg`;
          }
          
          // In development, if we don't have a local file, fallback to backend proxy
          if (IS_DEV && movie.thumb && !posterUrl) {
            posterUrl = `${API_BASE_URL}/poster?thumb=${encodeURIComponent(movie.thumb)}`;
          }
          
          return {
            ...movie,
            watchDate,
            year,
            poster: posterUrl,
            thumb: movie.thumb, // Keep thumb for fallback poster loading
            title: movieTitle,
            rating: movie.rating || null,
          };
        });

        // Sort by watch date (most recent first)
        processedMovies.sort((a, b) => b.date - a.date);
        
        // Store all watch data for accurate time calculations
        setAllWatchData(processedMovies);
        
        // Remove consecutive duplicates (same movie back-to-back) for display
        // But keep entries if there are other movies between them
        const deduplicatedMovies = [];
        for (let i = 0; i < processedMovies.length; i++) {
          const current = processedMovies[i];
          const previous = processedMovies[i - 1];
          
          // If this is the first movie, or if it's different from the previous one, add it
          // If it's the same as the previous one (consecutive duplicate), skip it
          if (i === 0 || current.rating_key !== previous?.rating_key) {
            deduplicatedMovies.push(current);
          }
        }
        
        // Extract unique years from deduplicated movies
        const uniqueYears = [...new Set(deduplicatedMovies.map(m => m.year))].sort((a, b) => b - a);
        
        console.log(`Processing took ${(performance.now() - processStart).toFixed(2)}ms`);
        
        // Cache the processed data
        const cacheStart = performance.now();
        await cache.set(cacheKey, {
          processed: deduplicatedMovies,
          allWatchData: processedMovies,
          years: uniqueYears
        });
        console.log(`Caching took ${(performance.now() - cacheStart).toFixed(2)}ms`);
        
        setMovies(deduplicatedMovies);
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
        
        console.log(`Total movies load time: ${(performance.now() - startTime).toFixed(2)}ms`);
      } else {
        setError('No movie data found');
      }
    } catch (err) {
      console.error('Error fetching movies:', err);
      if (err.message && err.message.includes('Failed to load movies data')) {
        setError(err.message);
      } else {
        setError('Failed to load movies data. Please run "npm run fetch-data" to generate the data files.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getMoviesByYear = useMemo(() => {
    return (year) => {
      if (year === 'current') {
        const currentYear = new Date().getFullYear();
        return movies.filter(m => m.year === currentYear);
      }
      return movies.filter(m => m.year === parseInt(year));
    };
  }, [movies]);

  // Get top 3 ranked movies for a year
  const getTop3ForYear = useMemo(() => {
    return (year) => {
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      
      // Find the first watch date for each movie (by rating_key)
      const firstWatchDates = new Map();
      allWatchData.forEach(movie => {
        if (movie.rating_key) {
          const watchYear = movie.watchDate ? movie.watchDate.getFullYear() : new Date(movie.date * 1000).getFullYear();
          const existing = firstWatchDates.get(movie.rating_key);
          if (!existing || watchYear < existing) {
            firstWatchDates.set(movie.rating_key, watchYear);
          }
        }
      });
      
      // Filter rankings to only include movies that were FIRST watched in this year, then take top 3
      const yearRankings = rankings
        .filter(r => {
          const firstWatchYear = firstWatchDates.get(r.rating_key);
          return firstWatchYear === targetYear;
        })
        .slice(0, 3);
      
      return yearRankings;
    };
  }, [rankings, allWatchData]); // Recompute when rankings or allWatchData change

  const getYearStats = useMemo(() => {
    // Pre-compute format function
    const formatWatchTime = (seconds) => {
      if (!seconds || seconds === 0) return '0 minutes';
      
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      
      const parts = [];
      if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
      if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
      if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
      
      return parts.join(', ');
    };
    
    return (year) => {
      const yearMovies = getMoviesByYear(year);
      
      // Count unique movies (deduplicated by rating_key)
      const uniqueMovies = new Set(yearMovies.map(m => m.rating_key));
      const count = uniqueMovies.size;
      
      // Calculate total watch time from ALL watch instances (not deduplicated)
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      const allYearWatches = allWatchData.filter(m => {
        const watchYear = m.watchDate ? m.watchDate.getFullYear() : new Date(m.date * 1000).getFullYear();
        return watchYear === targetYear;
      });
      
      const totalSeconds = allYearWatches.reduce((sum, movie) => {
        return sum + (movie.duration || 0);
      }, 0);
      
      return {
        count,
        totalWatchTime: formatWatchTime(totalSeconds)
      };
    };
  }, [movies, allWatchData, getMoviesByYear]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading movies...</div>
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
          <button className="switch-button" onClick={() => onNavigate('tv')}>
            📺 TV Shows
          </button>
        </div>
        <h1>Movies</h1>
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
          <RankingTab movies={movies} contentType="movies" />
        ) : activeTab === 'admin' && IS_DEV ? (
          isAdminAuthenticated ? (
            <AdminRankingTab movies={movies} contentType="movies" />
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
                    <span className="stat-label">Movies Watched:</span>
                    <span className="stat-value">{stats.count}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Watch Time:</span>
                    <span className="stat-value">{stats.totalWatchTime}</span>
                  </div>
                  {top3.map((item, index) => {
                    // Build poster URL - try local static files first, fallback to backend proxy in dev
                    let posterUrl = null;
                    if (item.rating_key) {
                      // Try local static poster file first (works in both dev and prod)
                      // Use STATIC_DATA_PATH to account for GitHub Pages base path
                      posterUrl = `${STATIC_DATA_PATH}/posters/${item.rating_key}.jpg`;
                    }
                    
                    // In development, if we don't have a local file, fallback to backend proxy
                    if (IS_DEV && item.thumb && !posterUrl) {
                      posterUrl = `${API_BASE_URL}/poster?thumb=${encodeURIComponent(item.thumb)}`;
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
                                    e.target.src = `${API_BASE_URL}/poster?ratingKey=${item.rating_key}`;
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
            <MovieList movies={getMoviesByYear(activeTab)} />
          </>
        )}
      </div>
    </div>
  );
}

export default MoviesView;

