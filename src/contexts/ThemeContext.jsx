import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

// Function to get system preference
function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Fallback to dark if we can't detect
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Check if theme was already set by inline script in HTML
    const existingTheme = document.documentElement.getAttribute('data-theme');
    if (existingTheme) {
      return existingTheme;
    }
    
    // Check localStorage first for user's manual selection
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    // If no saved preference, use system preference
    return getSystemTheme();
  });

  useEffect(() => {
    // Apply theme to document root (ensure it's set, even if inline script already did)
    document.documentElement.setAttribute('data-theme', theme);
    // Only save to localStorage if user has manually selected a theme
    // (we'll set a flag when they toggle)
    const hasManualSelection = localStorage.getItem('theme-manual') === 'true';
    if (hasManualSelection) {
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  // Listen for system theme changes (only if user hasn't manually selected)
  useEffect(() => {
    const hasManualSelection = localStorage.getItem('theme-manual') === 'true';
    if (hasManualSelection) {
      return; // Don't listen if user has manually selected
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const toggleTheme = () => {
    // Mark that user has manually selected a theme
    localStorage.setItem('theme-manual', 'true');
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

