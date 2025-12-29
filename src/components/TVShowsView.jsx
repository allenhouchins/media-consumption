import { useState, useEffect, useMemo, useRef } from 'react';
import '../App.css';
import MovieList from './MovieList';
import RankingTab from './RankingTab';
import AdminRankingTab from './AdminRankingTab';
import AdminLogin from './AdminLogin';
import { API_BASE_URL, IS_DEV, STATIC_DATA_PATH } from '../config';
import { cache } from '../utils/cache';

function TVShowsView({ onNavigate }) {
  const [shows, setShows] = useState([]);
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
    params.set('view', 'tv');
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
      fetchTVShows();
    }
  }, []);

  // Load rankings for Top 3 display
  useEffect(() => {
    const loadRankings = async () => {
      try {
        const cacheKey = `rankings-tv`;
        const cachedRankings = await cache.get(cacheKey);
        if (cachedRankings) {
          setRankings(cachedRankings);
          return;
        }
        
        let rankingsData = [];
        if (IS_DEV) {
          const response = await fetch(`${API_BASE_URL}/rankings/tv`);
          if (response.ok) {
            rankingsData = await response.json();
          }
        } else {
          const response = await fetch(`${STATIC_DATA_PATH}/tv-rankings.json`);
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
      // Only reload if it's for TV shows (not movies)
      if (!e.detail || !e.detail.contentType || e.detail.contentType === 'tv') {
        // Clear cache for rankings and reload fresh data
        const cacheKey = `rankings-tv`;
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

  const fetchTVShows = async () => {
    try {
      setLoading(true);
      const startTime = performance.now();
      
      // Check cache first
      const cacheKey = IS_DEV ? 'tvshows-dev' : 'tvshows-prod';
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        console.log(`Using cached data for TV shows (${cachedData.processed?.length || 0} shows)`);
        setShows(cachedData.processed);
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
        console.log(`TV shows loaded from cache in ${(performance.now() - startTime).toFixed(2)}ms`);
        return;
      }
      
      console.log('Loading TV shows from static data file...');
      const fetchStart = performance.now();
      // Always use static JSON files (both dev and production)
      // Run 'npm run fetch-data' to update the data
      const response = await fetch(`${STATIC_DATA_PATH}/tv-shows.json`);
      if (!response.ok) {
        throw new Error(`Failed to load TV shows data: ${response.status} ${response.statusText}. Please run 'npm run fetch-data' to generate the data files.`);
      }
      const data = await response.json();
      const fetchTime = performance.now() - fetchStart;
      console.log(`Static file fetch took ${fetchTime.toFixed(2)}ms`);
      
      // Check if data is stale (older than 24 hours)
      if (data._metadata?.lastFetched) {
        const lastFetched = new Date(data._metadata.lastFetched);
        const hoursSinceFetch = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);
        if (hoursSinceFetch > 24) {
          console.warn(`⚠️ TV show data is ${Math.round(hoursSinceFetch)} hours old. Run 'npm run fetch-data' to update.`);
        } else {
          console.log(`✓ Data is fresh (fetched ${Math.round(hoursSinceFetch)} hours ago)`);
        }
      }
      
      // Handle different possible response structures
      const showData = data.response?.data?.data || data.response?.data || data.data || [];
      console.log(`Processing ${showData.length} episodes...`);
      const processStart = performance.now();
      
      if (showData.length > 0) {
        
        // Group episodes by show and track watch dates
        const showMap = new Map();
        
        showData.forEach((episode) => {
          // Only process episodes, skip movies
          if (episode.media_type !== 'episode') {
            return;
          }
          
          const showTitle = episode.grandparent_title || episode.parent_title || 'Unknown Show';
          const showKey = episode.grandparent_rating_key || episode.parent_rating_key || episode.rating_key;
          
          // Handle date
          let watchDate;
          if (typeof episode.date === 'number') {
            watchDate = new Date(episode.date * 1000);
          } else if (typeof episode.date === 'string') {
            watchDate = new Date(episode.date);
          } else {
            watchDate = new Date();
          }
          
          if (!showMap.has(showKey)) {
            showMap.set(showKey, {
              rating_key: showKey,
              title: showTitle,
              episodes: [],
              firstWatched: watchDate,
              lastWatched: watchDate,
              totalDuration: 0,
              thumb: episode.thumb || null,
            });
          }
          
          const show = showMap.get(showKey);
          show.episodes.push(episode);
          show.totalDuration += episode.duration || 0;
          
          if (watchDate < show.firstWatched) {
            show.firstWatched = watchDate;
          }
          if (watchDate > show.lastWatched) {
            show.lastWatched = watchDate;
          }
        });
        
        // Convert map to array and process
        const processedShows = Array.from(showMap.values()).map((show) => {
          const watchYear = show.lastWatched.getFullYear();
          // Get release year from the first episode (all episodes should have the same year)
          const releaseYear = show.episodes[0]?.year || null;
          
          let posterUrl = null;
          if (show.rating_key) {
            // Try local static poster file first (works in both dev and prod)
            // Use STATIC_DATA_PATH to account for GitHub Pages base path
            posterUrl = `${STATIC_DATA_PATH}/posters/${show.rating_key}.jpg`;
          }
          
          // In development, if we don't have a local file, fallback to backend proxy
          if (IS_DEV && show.thumb && !posterUrl) {
            posterUrl = `${API_BASE_URL}/poster?thumb=${encodeURIComponent(show.thumb)}`;
          }
          
          return {
            ...show,
            watchDate: show.lastWatched,
            year: watchYear, // Keep watch year for filtering by watch date
            releaseYear, // Preserve release year for filtering top 3 by release date
            poster: posterUrl,
            thumb: show.thumb, // Keep thumb for fallback poster loading
            duration: show.totalDuration,
            episodeCount: show.episodes.length,
          };
        });

        // Deduplicate shows with the same title (merge shows with different rating_keys)
        // This handles cases where the same show exists multiple times in Plex
        const deduplicatedShows = [];
        const showsByTitle = new Map();
        
        processedShows.forEach(show => {
          const normalizedTitle = show.title.toLowerCase().trim();
          const existing = showsByTitle.get(normalizedTitle);
          
          if (!existing) {
            // First occurrence of this title
            showsByTitle.set(normalizedTitle, show);
            deduplicatedShows.push(show);
          } else {
            // Merge with existing show - keep the one with more episodes or more recent watch date
            if (show.episodeCount > existing.episodeCount || 
                (show.episodeCount === existing.episodeCount && show.watchDate > existing.watchDate)) {
              // Replace with the better version
              const index = deduplicatedShows.indexOf(existing);
              if (index !== -1) {
                deduplicatedShows[index] = show;
                showsByTitle.set(normalizedTitle, show);
              }
            }
            // Otherwise keep the existing one and discard this duplicate
          }
        });
        
        // Sort by last watched date (most recent first)
        deduplicatedShows.sort((a, b) => b.watchDate - a.watchDate);
        
        // Store all episode watch data for accurate time calculations
        // This includes all episodes watched, not just grouped by show
        const allEpisodeWatches = showData
          .filter(episode => episode.media_type === 'episode')
          .map(episode => {
            let watchDate;
            if (typeof episode.date === 'number') {
              watchDate = new Date(episode.date * 1000);
            } else if (typeof episode.date === 'string') {
              watchDate = new Date(episode.date);
            } else {
              watchDate = new Date();
            }
            return {
              ...episode,
              watchDate,
              year: watchDate.getFullYear(),
            };
          });
        
        // Extract unique years
        const uniqueYears = [...new Set(deduplicatedShows.map(s => s.year))].sort((a, b) => b - a);
        
        console.log(`Processing took ${(performance.now() - processStart).toFixed(2)}ms`);
        
        // Cache the processed data
        const cacheStart = performance.now();
        await cache.set(cacheKey, {
          processed: processedShows,
          allWatchData: allEpisodeWatches,
          years: uniqueYears
        });
        console.log(`Caching took ${(performance.now() - cacheStart).toFixed(2)}ms`);
        
        setAllWatchData(allEpisodeWatches);
        setShows(deduplicatedShows);
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
        
        console.log(`Total TV shows load time: ${(performance.now() - startTime).toFixed(2)}ms`);
      } else {
        setError('No TV show data found');
      }
    } catch (err) {
      console.error('Error fetching TV shows:', err);
      if (err.message && err.message.includes('Failed to load TV shows data')) {
        setError(err.message);
      } else {
        setError('Failed to load TV shows data. Please run "npm run fetch-data" to generate the data files.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getShowsByYear = useMemo(() => {
    return (year) => {
      if (year === 'current') {
        const currentYear = new Date().getFullYear();
        return shows.filter(s => s.year === currentYear);
      }
      return shows.filter(s => s.year === parseInt(year));
    };
  }, [shows]);

  // Get top 3 ranked TV shows for a year
  const getTop3ForYear = useMemo(() => {
    return (year) => {
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      
      // Create a map of release years by rating_key from the processed shows
      const releaseYearsByRatingKey = new Map();
      shows.forEach(show => {
        if (show.rating_key && show.releaseYear) {
          releaseYearsByRatingKey.set(show.rating_key, show.releaseYear);
        }
      });
      
      // Filter rankings to only include shows that were RELEASED in this year, then take top 3
      const yearRankings = rankings
        .filter(r => {
          const releaseYear = releaseYearsByRatingKey.get(r.rating_key);
          return releaseYear === targetYear;
        })
        .slice(0, 3);
      
      return yearRankings.map(r => r.title);
    };
  }, [rankings, shows]); // Recompute when rankings or shows change

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
      const yearShows = getShowsByYear(year);
      
      // Count unique shows (deduplicated by rating_key)
      const uniqueShows = new Set(yearShows.map(s => s.rating_key));
      const count = uniqueShows.size;
      
      // Calculate total episodes and watch time from ALL episode watches (not deduplicated)
      const targetYear = year === 'current' ? new Date().getFullYear() : parseInt(year);
      const allYearEpisodes = allWatchData.filter(e => {
        const watchYear = e.watchDate ? e.watchDate.getFullYear() : new Date(e.date * 1000).getFullYear();
        return watchYear === targetYear;
      });
      const totalEpisodes = allYearEpisodes.length;
      
      // Calculate total watch time from ALL episode watches
      const totalSeconds = allYearEpisodes.reduce((sum, episode) => {
        return sum + (episode.duration || 0);
      }, 0);
      
      return {
        count,
        totalEpisodes,
        totalWatchTime: formatWatchTime(totalSeconds)
      };
    };
  }, [shows, allWatchData, getShowsByYear]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading TV shows...</div>
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
      <header className="app-header tv-header">
        <div className="header-top">
          <button className="home-button" onClick={() => onNavigate('home')}>
            ← Home
          </button>
          <div className="nav-buttons">
            <button className="switch-button" onClick={() => onNavigate('movies')}>
              🎬 Movies
            </button>
            <button className="switch-button" onClick={() => onNavigate('comics')}>
              📚 Comic Books
            </button>
          </div>
        </div>
        <h1>TV Shows</h1>
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
          <RankingTab movies={shows} contentType="tv" />
        ) : activeTab === 'admin' && IS_DEV ? (
          isAdminAuthenticated ? (
            <AdminRankingTab movies={shows} contentType="tv" />
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
                    <span className="stat-label">Shows Watched:</span>
                    <span className="stat-value">{stats.count}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Episodes Watched:</span>
                    <span className="stat-value">{stats.totalEpisodes}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Watch Time:</span>
                    <span className="stat-value">{stats.totalWatchTime}</span>
                  </div>
                  {top3.map((title, index) => (
                    <div key={index} className="stat-item top-3-stat-item">
                      <span className="stat-label">#{index + 1}</span>
                      <span className="stat-value top-3-value">{title}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <MovieList movies={getShowsByYear(activeTab)} />
          </>
        )}
      </div>
    </div>
  );
}

export default TVShowsView;

