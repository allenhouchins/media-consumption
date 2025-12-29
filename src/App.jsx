import { useState, useEffect } from 'react';
import './App.css';
import HomePage from './components/HomePage';
import MoviesView from './components/MoviesView';
import TVShowsView from './components/TVShowsView';
import ComicBooksView from './components/ComicBooksView';
import ThemeToggle from './components/ThemeToggle';

function App() {
  // Initialize from URL or default to home
  const getInitialView = () => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'home';
    return view === 'movies' || view === 'tv' || view === 'comics' ? view : 'home';
  };

  const [currentView, setCurrentView] = useState(getInitialView);

  // Update URL when view changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (currentView === 'home') {
      // Remove view param when on home
      params.delete('view');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else {
      params.set('view', currentView);
      const newUrl = `?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [currentView]);

  const handleNavigate = (view) => {
    setCurrentView(view);
  };
  
  return (
    <div className="app-container">
      <ThemeToggle />
      {currentView === 'home' && <HomePage onSelectContent={handleNavigate} />}
      {currentView === 'movies' && <MoviesView onNavigate={handleNavigate} />}
      {currentView === 'tv' && <TVShowsView onNavigate={handleNavigate} />}
      {currentView === 'comics' && <ComicBooksView onNavigate={handleNavigate} />}
    </div>
  );
}

export default App;

