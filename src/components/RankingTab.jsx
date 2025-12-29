import { useState, useEffect, useRef } from 'react';
import './RankingTab.css';
import { API_BASE_URL, IS_DEV, STATIC_DATA_PATH } from '../config';
import { cache } from '../utils/cache';

function RankingTab({ movies, contentType = 'movies' }) {
  const [rankings, setRankings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  
  // Use different localStorage keys for movies vs TV shows vs comics
  const storageKey = contentType === 'tv' ? 'tvShowRankings' : contentType === 'comics' ? 'comicRankings' : 'movieRankings';
  const cacheKey = `rankings-${contentType}`;

  useEffect(() => {
    // Load rankings from server (shared across all users)
    const loadRankings = async (forceRefresh = false) => {
      setIsLoading(true);
      const startTime = performance.now();
      
      try {
        // Check cache first, but skip if forceRefresh is true or cache is older than 5 seconds
        if (!forceRefresh) {
          const cachedRankings = await cache.get(cacheKey);
          const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
          if (cachedRankings && timeSinceLastLoad < 5000) {
            console.log(`Using cached rankings for ${contentType} (${cachedRankings.length} items)`);
            setRankings(cachedRankings);
            setIsLoading(false);
            return;
          }
        }
        
        // Try to load from API (development) or static file (production)
        let rankingsData = [];
        
        if (IS_DEV) {
          // In development: load from backend API
          const fetchStart = performance.now();
          const endpoint = contentType === 'tv' ? 'tv' : contentType === 'comics' ? 'comics' : 'movies';
          const response = await fetch(`${API_BASE_URL}/rankings/${endpoint}`);
          const fetchTime = performance.now() - fetchStart;
          console.log(`[Rankings] API fetch took ${fetchTime.toFixed(2)}ms`);
          
          if (response.ok) {
            rankingsData = await response.json();
          }
        } else {
          // In production: load from static JSON file
          const fetchStart = performance.now();
          const filename = contentType === 'tv' ? 'tv-rankings.json' : contentType === 'comics' ? 'comic-rankings.json' : 'movie-rankings.json';
          const response = await fetch(`${STATIC_DATA_PATH}/${filename}`);
          const fetchTime = performance.now() - fetchStart;
          console.log(`[Rankings] Static file fetch took ${fetchTime.toFixed(2)}ms`);
          
          if (response.ok) {
            rankingsData = await response.json();
          }
        }
        
        // Restore Date objects
        const processStart = performance.now();
        const restoredRankings = rankingsData.map(r => ({
          ...r,
          watchDate: r.watchDate ? new Date(r.watchDate) : new Date()
        }));
        const processTime = performance.now() - processStart;
        console.log(`[Rankings] Processing took ${processTime.toFixed(2)}ms`);
        
        // Cache the results
        const cacheStart = performance.now();
        await cache.set(cacheKey, restoredRankings);
        const cacheTime = performance.now() - cacheStart;
        console.log(`[Rankings] Caching took ${cacheTime.toFixed(2)}ms`);
        
        setRankings(restoredRankings);
        lastLoadTimeRef.current = Date.now();
        
        const totalTime = performance.now() - startTime;
        console.log(`[Rankings] Total load time: ${totalTime.toFixed(2)}ms`);
      } catch (e) {
        console.error('Error loading rankings:', e);
        // Fallback to localStorage if server fails
        const savedRankings = localStorage.getItem(storageKey);
        if (savedRankings) {
          try {
            const parsed = JSON.parse(savedRankings);
            const restoredRankings = parsed.map(r => ({
              ...r,
              watchDate: r.watchDate ? new Date(r.watchDate) : new Date()
            }));
            setRankings(restoredRankings);
            // Cache the localStorage fallback
            await cache.set(cacheKey, restoredRankings);
            lastLoadTimeRef.current = Date.now();
          } catch (parseError) {
            console.error('Error parsing localStorage rankings:', parseError);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    // Load on mount
    if (!fetchingRef.current) {
      fetchingRef.current = true;
      loadRankings();
    }
    
    // Listen for visibility changes to refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible, refresh if cache is older than 2 seconds
        const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
        if (timeSinceLastLoad > 2000) {
          console.log('[Rankings] Tab became visible, refreshing rankings...');
          loadRankings(true);
        }
      }
    };
    
    // Listen for custom event when rankings are saved
    const handleRankingsSaved = () => {
      console.log('[Rankings] Rankings saved event received, refreshing...');
      loadRankings(true);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('rankingsSaved', handleRankingsSaved);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('rankingsSaved', handleRankingsSaved);
    };
  }, [storageKey, contentType, cacheKey]); // Reload when contentType changes

  return (
    <div className="ranking-tab">
      <div className="ranking-section">
        <h2>My Rankings</h2>
        
        {isLoading ? (
          <div className="empty-rankings">
            <p>Loading...</p>
          </div>
        ) : rankings.length === 0 ? (
          <div className="empty-rankings">
            <p>No {contentType === 'tv' ? 'TV shows' : contentType === 'comics' ? 'comic books' : 'movies'} ranked yet. Use the Admin tab to start ranking!</p>
          </div>
        ) : (
          <div className="rankings-grid read-only">
            {rankings.map((movie, index) => (
              <div
                key={movie.rating_key}
                className="ranking-card read-only-item"
              >
                <div className="rank-badge">{index + 1}</div>
                <div className="ranking-poster-card">
                  {movie.poster ? (
                    <img 
                      src={movie.poster} 
                      alt={movie.title}
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23ddd" width="200" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Poster%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  ) : (
                    <div className="poster-placeholder-card">No Poster</div>
                  )}
                </div>
                <div className="ranking-title-card">
                  <h4>{movie.title}</h4>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RankingTab;

