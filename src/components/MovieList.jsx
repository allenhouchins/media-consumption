import { useMemo } from 'react';
import './MovieList.css';
import { API_BASE_URL, IS_DEV } from '../config';

function MovieList({ movies, contentType }) {
  const sortedMovies = useMemo(() => {
    if (!movies || movies.length === 0) return [];
    // Sort by watch date (most recent first)
    return [...movies].sort((a, b) => b.date - a.date);
  }, [movies]);

  if (!movies || movies.length === 0) {
    const emptyMessage = contentType === 'comics' 
      ? 'No comic books found for this year.'
      : contentType === 'tv'
      ? 'No TV shows found for this year.'
      : 'No movies found for this year.';
    return (
      <div className="movie-list-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="movie-list">
      {sortedMovies.map((movie) => (
          <div key={`${movie.rating_key}-${movie.date}`} className="movie-card">
            <div className="movie-poster">
              {movie.poster ? (
                <img 
                  src={movie.poster} 
                  alt={movie.title}
                  loading="lazy"
                  onError={(e) => {
                    // If local poster file fails, try backend proxy in dev mode
                    const originalSrc = e.target.src;
                    if (IS_DEV && movie.rating_key) {
                      // First try using rating_key to get poster via API
                      const fallbackUrl = `${API_BASE_URL}/poster?ratingKey=${movie.rating_key}`;
                      e.target.src = fallbackUrl;
                      return;
                    }
                    // If thumb is available and we're in dev, try using it directly
                    if (IS_DEV && movie.thumb) {
                      const thumbUrl = `${API_BASE_URL}/poster?thumb=${encodeURIComponent(movie.thumb)}`;
                      e.target.src = thumbUrl;
                      return;
                    }
                    // Final fallback to placeholder
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23ddd" width="200" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Poster%3C/text%3E%3C/svg%3E';
                  }}
                />
              ) : (
                <div className="poster-placeholder">
                  <span>No Poster</span>
                </div>
              )}
            </div>
            <div className="movie-info">
              <h3 className="movie-title">{movie.title}</h3>
              <p className="movie-date">
                {contentType === 'comics' ? 'Read' : 'Watched'}: {movie.watchDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              {movie.rating && (
                <p className="movie-rating">Rating: {movie.rating}/10</p>
              )}
            </div>
        </div>
      ))}
    </div>
  );
}

export default MovieList;

