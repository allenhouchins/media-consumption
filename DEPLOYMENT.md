# Deployment Guide

This guide explains how to deploy this application to GitHub Pages.

## Overview

The application uses **static data files** for production deployment. Data is fetched from Tautulli at build time and saved as JSON files, which are then served as static files on GitHub Pages.

- **Development**: Fetches data dynamically from Tautulli API via proxy server
- **Production**: Uses pre-generated static JSON files (no API calls needed)

## Prerequisites

1. A GitHub repository
2. Tautulli instance accessible during build time
3. GitHub Actions enabled for your repository

## Step 1: Generate and Commit Static Data

**IMPORTANT**: GitHub Actions cannot access your local Tautulli server. You must generate the static data files locally and commit them to your repository.

1. **Set up your `.env` file** with Tautulli credentials:
   ```env
   TAUTULLI_URL=http://your-tautulli-server:8181
   TAUTULLI_API_KEY=your_api_key
   ```

2. **Run the data fetch script locally**:
   ```bash
   npm run fetch-data
   ```

   This will create:
   - `public/data/movies.json` - All movie watch history
   - `public/data/tv-shows.json` - All TV show watch history

3. **Commit these JSON files** to your repository:
   ```bash
   git add public/data/*.json
   git commit -m "Update static data files"
   git push
   ```

   These files will be served as static files on GitHub Pages.

## Step 2: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add the following secrets (all optional except admin password if you want to change it):
   - `VITE_ADMIN_PASSWORD`: Your admin password (optional, defaults to 'admin')
   - `VITE_PLEX_URL`: Your Plex server URL (optional, for poster images in production)
   - `VITE_PLEX_TOKEN`: Your Plex token (optional, for poster images in production)
   - `VITE_TAUTULLI_URL`: Your Tautulli server URL (optional, for poster images in production)
   - `VITE_TAUTULLI_API_KEY`: Your Tautulli API key (optional, for poster images in production)

   **Note**: You do NOT need to set `TAUTULLI_URL` or `TAUTULLI_API_KEY` as secrets since data is fetched locally, not during GitHub Actions build.

## Step 3: GitHub Actions Workflow

The workflow (`.github/workflows/deploy.yml`) will:
1. Use the committed static JSON files from your repository
2. Build the React app
3. Deploy to GitHub Pages

**No Tautulli access is needed** - the workflow uses the static data files you committed.

## Step 4: Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

## Step 5: Deploy

1. Push your code (including the static data files) to the `main` branch
2. GitHub Actions will automatically:
   - Build the React app using the committed static JSON files
   - Deploy to GitHub Pages
3. Your site will be available at `https://yourusername.github.io/repository-name`

**Note**: The deployed site uses the static JSON files you committed. To update the data:
1. Run `npm run fetch-data` locally
2. Commit the updated JSON files
3. Push to trigger a new deployment

## Manual Deployment

If you prefer to deploy manually:

```bash
# 1. Set up .env file with Tautulli credentials
# 2. Fetch static data
npm run fetch-data

# 3. Build (this will include the static data)
npm run build

# 4. The dist/ folder contains your static site
# Upload the contents to your hosting service
```

## Updating Data

To update the data shown on your website:

1. **Run locally**: `npm run fetch-data` (requires access to your Tautulli server)
2. **Commit the updated files**: `git add public/data/*.json && git commit -m "Update data"`
3. **Push**: `git push` (triggers automatic deployment)

**Note**: Since GitHub Actions cannot access your local Tautulli server, you must update the data files locally and commit them. Consider setting up a local cron job or scheduled task to automatically fetch and commit updated data.

## Troubleshooting

### API Calls Failing

- Verify your proxy server is running and accessible
- Check that `VITE_API_BASE_URL` is correctly set
- Ensure CORS is properly configured on your proxy server

### Admin Login Not Working

- Verify `VITE_ADMIN_PASSWORD` is set correctly
- Check browser console for errors
- Ensure the password matches what you set in GitHub Secrets

### Images Not Loading

- Verify your proxy server's `/api/poster` endpoint is working
- Check that Plex token is set if required
- Ensure Tautulli image proxy is accessible

