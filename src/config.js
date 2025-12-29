// Configuration for the application
// Uses environment variables for sensitive data

// Determine if we're in development mode
export const IS_DEV = import.meta.env.DEV || import.meta.env.MODE === 'development';

// Get base URL from Vite (will be '/media-consumption/' in production, '/' in dev)
const BASE_URL = import.meta.env.BASE_URL || '/';

// API Base URL - in dev mode, use the backend server, otherwise use relative path
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (IS_DEV ? 'http://localhost:3001/api' : '/api');

// Static data path - points to the public/data directory
// Account for base URL in production (GitHub Pages)
// BASE_URL will be '/media-consumption/' in production or '/' in dev
// Normalize BASE_URL (remove trailing slash if present) then add /data
const normalizedBase = BASE_URL === '/' ? '' : BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
export const STATIC_DATA_PATH = BASE_URL === '/' ? '/data' : `${normalizedBase}/data`;

// Admin password - from environment variable or default to 'admin'
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin';

