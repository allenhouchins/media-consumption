import { useState, useEffect } from 'react';
import React from 'react';
import './AdminRankingTab.css';
import { API_BASE_URL, IS_DEV, STATIC_DATA_PATH } from '../config';
import { cache } from '../utils/cache';

function AdminRankingTab({ movies, contentType = 'movies' }) {
  const [rankings, setRankings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'saved', 'error'
  
  // Use different localStorage keys for movies vs TV shows
  const storageKey = contentType === 'tv' ? 'tvShowRankings' : contentType === 'comics' ? 'comicRankings' : 'movieRankings';

  const rankingsLoadedRef = React.useRef({});
  const lastContentTypeRef = React.useRef(contentType);

  useEffect(() => {
    // If contentType changed, reset the loaded flag for the new contentType
    if (lastContentTypeRef.current !== contentType) {
      const oldCacheKey = `${lastContentTypeRef.current}-${IS_DEV ? 'dev' : 'prod'}`;
      delete rankingsLoadedRef.current[oldCacheKey];
      lastContentTypeRef.current = contentType;
      setRankings([]); // Reset rankings when switching content types
      setIsLoading(true); // Reset loading state
    }
    
    // Only load rankings once per contentType (prevent duplicate loads)
    const cacheKey = `${contentType}-${IS_DEV ? 'dev' : 'prod'}`;
    if (rankingsLoadedRef.current[cacheKey]) {
      return; // Already loaded, skip
    }
    rankingsLoadedRef.current[cacheKey] = true;
    
    // Load rankings from server (shared across all users)
    const loadRankings = async () => {
      setIsLoading(true);
      try {
        // Load from API (development) or static file (production)
        let rankingsData = [];
        
        if (IS_DEV) {
          // In development: try backend API first, fallback to static files
          const endpoint = contentType === 'tv' ? 'tv' : contentType === 'comics' ? 'comics' : 'movies';
          try {
            const response = await fetch(`${API_BASE_URL}/rankings/${endpoint}`);
            if (response.ok) {
              rankingsData = await response.json();
            } else {
              // API failed, try static files as fallback
              throw new Error('API not available');
            }
          } catch (apiError) {
            console.log(`[AdminRankingTab] API unavailable, falling back to static files:`, apiError.message);
            // Fallback to static JSON file
            const filename = contentType === 'tv' ? 'tv-rankings.json' : contentType === 'comics' ? 'comic-rankings.json' : 'movie-rankings.json';
            const staticResponse = await fetch(`${STATIC_DATA_PATH}/${filename}`);
            if (staticResponse.ok) {
              rankingsData = await staticResponse.json();
            } else {
              console.error(`[AdminRankingTab] Failed to load rankings from static file: ${staticResponse.status}`);
            }
          }
        } else {
          // In production: load from static JSON file
          const filename = contentType === 'tv' ? 'tv-rankings.json' : contentType === 'comics' ? 'comic-rankings.json' : 'movie-rankings.json';
          const response = await fetch(`${STATIC_DATA_PATH}/${filename}`);
          if (response.ok) {
            rankingsData = await response.json();
          } else {
            console.error(`[AdminRankingTab] Failed to load rankings: ${response.status}`);
          }
        }
        
        // Restore Date objects, fix poster paths for dev mode, and set rankings
        const restoredRankings = rankingsData.map(r => {
          // Fix poster paths: if poster starts with /media-consumption/ and we're in dev mode, remove it
          let poster = r.poster;
          if (IS_DEV && poster && poster.startsWith('/media-consumption/')) {
            poster = poster.replace('/media-consumption', '');
          }
          return {
            ...r,
            poster,
            watchDate: r.watchDate ? new Date(r.watchDate) : new Date()
          };
        });
        setRankings(restoredRankings);
      } catch (e) {
        console.error('Error loading rankings:', e);
        // Fallback to localStorage if server fails
        setRankings(currentRankings => {
          // Only load from localStorage if we don't have rankings
          if (currentRankings.length === 0) {
            const savedRankings = localStorage.getItem(storageKey);
            if (savedRankings) {
              try {
                const parsed = JSON.parse(savedRankings);
                const restoredRankings = parsed.map(r => ({
                  ...r,
                  watchDate: r.watchDate ? new Date(r.watchDate) : new Date()
                }));
                return restoredRankings;
              } catch (parseError) {
                console.error('Error parsing localStorage rankings:', parseError);
              }
            }
          }
          return currentRankings;
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRankings();
  }, [contentType, storageKey]); // Reload when contentType changes

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Store the dragged index on the element for fallback
    e.currentTarget.setAttribute('data-drag-index', index);
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    // Set the drag over index for visual feedback
    const currentDraggedIndex = draggedIndex !== null ? draggedIndex : parseInt(e.dataTransfer.getData('text/plain') || '-1');
    if (currentDraggedIndex !== null && currentDraggedIndex !== -1 && currentDraggedIndex !== index) {
      setDragOverIndex(index);
    } else {
      setDragOverIndex(null);
    }
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the rankings list area
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    
    // Get the dragged index from state or dataTransfer
    let sourceIndex = draggedIndex;
    if (sourceIndex === null) {
      sourceIndex = parseInt(e.dataTransfer.getData('text/plain') || '-1');
    }
    
    if (sourceIndex === null || sourceIndex === -1 || sourceIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // Use functional update to ensure we have the latest rankings state
    setRankings(currentRankings => {
      if (sourceIndex < 0 || sourceIndex >= currentRankings.length) {
        return currentRankings;
      }
      
      const newRankings = [...currentRankings];
      const draggedItem = newRankings[sourceIndex];
      newRankings.splice(sourceIndex, 1);
      
      // Adjust dropIndex if we removed an item before it
      const adjustedDropIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newRankings.splice(adjustedDropIndex, 0, draggedItem);
      
      saveRankings(newRankings);
      return newRankings;
    });
    
    setDraggedIndex(null);
  };

  const addToRankings = (movie) => {
    // Use functional update to ensure we have the latest rankings state
    setRankings(currentRankings => {
      // Check if movie is already in rankings
      if (currentRankings.some(r => r.rating_key === movie.rating_key)) {
        return currentRankings; // Don't add duplicates
      }
      
      // Add the movie to rankings
      const newRankings = [...currentRankings, movie];
      saveRankings(newRankings);
      return newRankings;
    });
  };

  const removeFromRankings = (ratingKey) => {
    // Use functional update to ensure we have the latest rankings state
    setRankings(currentRankings => {
      const newRankings = currentRankings.filter(r => r.rating_key !== ratingKey);
      saveRankings(newRankings);
      return newRankings;
    });
  };

  const saveRankings = async (rankingsToSave) => {
    // Strip down rankings to only essential fields before saving
    // Keep: rating_key (id), title, poster, thumb (poster thumb path), year
    const minimalRankings = rankingsToSave.map(item => {
      const minimal = {
        rating_key: item.rating_key,
        title: item.title
      };
      
      // Add poster if available
      if (item.poster) {
        minimal.poster = item.poster;
      }
      
      // Add thumb (poster thumb path, not user_thumb which is user avatar)
      if (item.thumb) {
        minimal.thumb = item.thumb;
      }
      
      // Add year if available
      if (item.year) {
        minimal.year = item.year;
      }
      
      return minimal;
    });
    
    // Always save to localStorage as backup (synchronous)
    localStorage.setItem(storageKey, JSON.stringify(minimalRankings));
    
    // Only save to server in development mode
    if (!IS_DEV) {
      // Production mode: just save to localStorage
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
      return;
    }
    
    // Development mode: save to server
    setSaveStatus('saving');
    
    try {
      const endpoint = `${API_BASE_URL}/rankings/${contentType === 'tv' ? 'tv' : contentType === 'comics' ? 'comics' : 'movies'}`;
      console.log('[AdminRankingTab] Saving rankings to:', endpoint);
      console.log('[AdminRankingTab] Rankings to save:', minimalRankings.length, 'items');
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(minimalRankings),
      });
      
      console.log('[AdminRankingTab] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AdminRankingTab] Failed to save rankings:', response.status, errorText);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(''), 3000);
      } else {
        const result = await response.json();
        console.log('[AdminRankingTab] ✓ Rankings saved successfully:', result.count || rankingsToSave.length, 'items');
        console.log('[AdminRankingTab] Server response:', result);
        
        // Clear the cache so RankingTab will reload fresh data
        const cacheKey = `rankings-${contentType}`;
        try {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('MovieSiteCache', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains('data')) {
                db.createObjectStore('data', { keyPath: 'key' });
              }
            };
          });
          const transaction = db.transaction(['data'], 'readwrite');
          const store = transaction.objectStore('data');
          await store.delete(cacheKey);
          console.log('[AdminRankingTab] Cleared cache for rankings');
        } catch (e) {
          console.warn('[AdminRankingTab] Could not clear IndexedDB cache:', e);
        }
        
        // Update local state to match what was saved (prevent race conditions)
        // Use minimalRankings to keep state in sync with saved data
        setRankings(minimalRankings);
        
        // Dispatch custom event to notify RankingTab to refresh
        window.dispatchEvent(new CustomEvent('rankingsSaved', { 
          detail: { contentType } 
        }));
        
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      }
    } catch (error) {
      console.error('[AdminRankingTab] Error saving rankings to server:', error);
      console.error('[AdminRankingTab] Error details:', error.message, error.stack);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const exportRankings = () => {
    const dataStr = JSON.stringify(rankings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const filename = contentType === 'tv' ? 'tv-rankings.json' : contentType === 'comics' ? 'comic-rankings.json' : 'movie-rankings.json';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Deduplicate movies by rating_key (in case same movie was watched multiple times)
  const uniqueMovies = Array.from(
    movies.reduce((map, movie) => {
      if (!map.has(movie.rating_key)) {
        map.set(movie.rating_key, movie);
      }
      return map;
    }, new Map()).values()
  );

  const rankedMovieKeys = new Set(rankings.map(r => r.rating_key));
  const unrankedMovies = uniqueMovies.filter(m => !rankedMovieKeys.has(m.rating_key));

  return (
    <div className="admin-ranking-tab">
      <div className="admin-header">
        <div className="admin-header-top">
          <div>
            <h2>Admin: Manage Rankings</h2>
            <p className="admin-subtitle">Drag and drop to reorder rankings. Add or remove {contentType === 'tv' ? 'TV shows' : contentType === 'comics' ? 'comic books' : 'movies'} from my rankings.</p>
          </div>
          <div className="admin-actions">
            {saveStatus === 'saving' && <span className="save-status saving">Saving...</span>}
            {saveStatus === 'saved' && <span className="save-status saved">✓ Saved</span>}
            {saveStatus === 'error' && <span className="save-status error">✗ Save failed</span>}
            {!IS_DEV && (
              <button 
                className="export-button"
                onClick={exportRankings}
                title="Export rankings JSON file for committing to git"
              >
                📥 Export JSON
              </button>
            )}
          </div>
        </div>
        {!IS_DEV && (
          <div className="production-notice">
            <p>⚠️ Production mode: Rankings are saved to localStorage. Export the JSON file and commit it to git to share with all visitors.</p>
          </div>
        )}
      </div>

      <div className="admin-sections">
        <div className="ranked-section">
          <div className="section-header">
            <div className="section-header-top">
              <div>
                <h3>Ranked {contentType === 'tv' ? 'TV Shows' : contentType === 'comics' ? 'Comic Books' : 'Movies'} ({rankings.length})</h3>
                <p className="section-description">Drag {contentType === 'tv' ? 'shows' : contentType === 'comics' ? 'comics' : 'movies'} to reorder. Click × to remove from rankings.</p>
              </div>
              <button 
                className="save-button"
                onClick={() => saveRankings(rankings)}
                disabled={saveStatus === 'saving'}
                title="Manually save rankings"
              >
                {saveStatus === 'saving' ? 'Saving...' : '💾 Save'}
              </button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="empty-rankings">
              <p>Loading...</p>
            </div>
          ) : rankings.length === 0 ? (
            <div className="empty-rankings">
              <p>No {contentType === 'tv' ? 'TV shows' : contentType === 'comics' ? 'comic books' : 'movies'} ranked yet. Add {contentType === 'tv' ? 'shows' : contentType === 'comics' ? 'comics' : 'movies'} from the unranked section below.</p>
            </div>
          ) : (
            <div className="rankings-list">
              {rankings.map((movie, index) => (
                <React.Fragment key={movie.rating_key}>
                  {dragOverIndex === index && draggedIndex !== null && draggedIndex !== index && (
                    <div className="drop-indicator" />
                  )}
                  <div
                    className={`ranking-item draggable ${dragOverIndex === index && draggedIndex !== null && draggedIndex !== index ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                  <div className="rank-number">{index + 1}</div>
                  <div className="ranking-poster">
                    {movie.poster ? (
                      <img 
                        src={movie.poster} 
                        alt={movie.title}
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="90"%3E%3Crect fill="%23ddd" width="60" height="90"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Poster%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    ) : (
                      <div className="poster-placeholder-small">No Poster</div>
                    )}
                  </div>
                  <div className="ranking-info">
                    <h4>{movie.title}</h4>
                  </div>
                  <button
                    className="remove-button"
                    onClick={() => removeFromRankings(movie.rating_key)}
                    aria-label="Remove from rankings"
                  >
                    ×
                  </button>
                </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="unranked-section">
          <div className="section-header">
            <h3>Unranked {contentType === 'tv' ? 'TV Shows' : contentType === 'comics' ? 'Comic Books' : 'Movies'} ({unrankedMovies.length})</h3>
            <p className="section-description">Click a {contentType === 'tv' ? 'show' : contentType === 'comics' ? 'comic' : 'movie'} to add it to my rankings.</p>
          </div>
          
          {unrankedMovies.length === 0 ? (
            <div className="empty-unranked">
              <p>All {contentType === 'tv' ? 'TV shows' : contentType === 'comics' ? 'comic books' : 'movies'} have been ranked!</p>
            </div>
          ) : (
            <div className="unranked-movies">
              {unrankedMovies.map((movie) => (
                <div
                  key={movie.rating_key}
                  className="unranked-movie-card"
                  onClick={() => addToRankings(movie)}
                >
                  <div className="unranked-poster">
                    {movie.poster ? (
                      <img 
                        src={movie.poster} 
                        alt={movie.title}
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="90"%3E%3Crect fill="%23ddd" width="60" height="90"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="10" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Poster%3C/text%3E%3C/svg%3E';
                        }}
                      />
                    ) : (
                      <div className="poster-placeholder-small">No Poster</div>
                    )}
                  </div>
                  <div className="unranked-info">
                    <h4>{movie.title}</h4>
                    <button className="add-button">+ Add to Rankings</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminRankingTab;

