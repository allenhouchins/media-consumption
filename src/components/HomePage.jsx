import './HomePage.css';

function HomePage({ onSelectContent }) {
  return (
    <div className="homepage">
      <div className="homepage-content">
        <div className="content-selector">
          <button 
            className="content-button movies-button"
            onClick={() => onSelectContent('movies')}
          >
            <div className="button-icon">🎬</div>
            <div className="button-content">
              <h2>Movies</h2>
            </div>
          </button>
          
          <button 
            className="content-button tv-button"
            onClick={() => onSelectContent('tv')}
          >
            <div className="button-icon">📺</div>
            <div className="button-content">
              <h2>TV Shows</h2>
            </div>
          </button>
          
          <button 
            className="content-button comics-button"
            onClick={() => onSelectContent('comics')}
          >
            <div className="button-icon">📚</div>
            <div className="button-content">
              <h2>Comic Books</h2>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default HomePage;

