# Security Guide

This document explains how to securely configure and deploy this application.

## Important Security Notes

⚠️ **Never commit sensitive credentials to GitHub!**

All API keys, passwords, and server URLs must be configured via environment variables or configuration files that are excluded from version control.

## Configuration Files

### Environment Variables (.env)

Create a `.env` file in the root directory (copy from `.env.example`):

```bash
cp .env.example .env
```

Then edit `.env` with your actual credentials:

```env
TAUTULLI_URL=http://your-tautulli-server:8181
TAUTULLI_API_KEY=your_actual_api_key
PLEX_URL=http://your-plex-server:32400
PLEX_TOKEN=your_plex_token
ADMIN_PASSWORD=your_secure_password
```

**The `.env` file is already in `.gitignore` and will NOT be committed to GitHub.**

### Frontend Configuration

For the frontend (GitHub Pages deployment), the site uses **static data files** that are generated locally and committed to the repository. No API calls are made in production.

Optional environment variables for build time (prefixed with `VITE_`):
- `VITE_ADMIN_PASSWORD`: Admin password (defaults to 'admin')
- `VITE_PLEX_URL`: Plex server URL (for poster images)
- `VITE_PLEX_TOKEN`: Plex token (for poster images)

## Deployment Options

### Option 1: Static Site with Pre-Generated Data (Recommended for GitHub Pages)

The production site is fully static with data files committed to the repository:

1. **Generate static data locally**: `npm run fetch-data` (requires local Tautulli access)
2. **Commit the data files**: `public/data/*.json` files are committed to the repo
3. **Build and deploy**: GitHub Actions builds using the committed static files

**Advantages**:
- No proxy server needed
- No API calls in production
- Fully static site (fast, secure)
- No credentials needed in GitHub Actions

**Note**: To update data, you must run `npm run fetch-data` locally and commit the updated files.

### Option 2: Local Development with Dynamic API

For local development, the app fetches data dynamically:

1. **Create `.env` file** with your credentials
2. **Run `npm run dev`** - starts frontend and backend proxy
3. **Access at `http://localhost:3000`**

The development server uses the proxy (`server.js`) to fetch data from Tautulli in real-time.

### Option 3: Local Development Only

For local development, use the included proxy server:

1. **Create `.env` file** with your credentials
2. **Run `npm run dev`** - this starts both frontend and backend
3. **Access at `http://localhost:3000`**

## Security Checklist

Before publishing to GitHub:

- [ ] All credentials removed from source code
- [ ] `.env` file created and added to `.gitignore`
- [ ] `.env.example` updated (without real credentials)
- [ ] `server.js` uses only environment variables
- [ ] Frontend uses `config.js` with environment variables
- [ ] Admin password set via `VITE_ADMIN_PASSWORD`
- [ ] API endpoints use `VITE_API_BASE_URL`
- [ ] No hardcoded IPs, URLs, or keys in source files
- [ ] README.md updated with setup instructions

## Verifying Security

Before committing, search for any hardcoded credentials:

```bash
# Search for common credential patterns
grep -r "192\.168\." src/
grep -r "10AXi3Q7KS1pahcNfKEcL4nk5qp34huX" src/
grep -r "UpzFaq1sn2w6E-zNy5oa" src/
grep -r "const.*=.*['\"].*http" src/
```

If any results appear, they should be removed and replaced with environment variable references.

## Changing Credentials

If credentials are accidentally committed:

1. **Immediately rotate/change** the exposed credentials
2. **Remove from git history** using `git filter-branch` or BFG Repo-Cleaner
3. **Force push** to update remote repository
4. **Notify** anyone who may have cloned the repository

