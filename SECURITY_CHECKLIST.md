# Pre-Publish Security Checklist

Use this checklist before committing and pushing to GitHub.

## ✅ Credentials Removed from Source Code

- [ ] No hardcoded API keys in `server.js`
- [ ] No hardcoded passwords in `src/components/AdminLogin.jsx`
- [ ] No hardcoded IP addresses in source files (examples in README are OK)
- [ ] All API endpoints use `API_BASE_URL` from config
- [ ] All passwords use `ADMIN_PASSWORD` from config

## ✅ Configuration Files

- [ ] `.env.example` created with placeholder values
- [ ] `.env` file exists locally (will be gitignored)
- [ ] `.gitignore` includes `.env`, `.env.local`, and `config.js`
- [ ] `src/config.js` uses environment variables only

## ✅ Server Configuration

- [ ] `server.js` validates required environment variables
- [ ] `server.js` exits with error if credentials missing
- [ ] All credentials read from `process.env`

## ✅ Frontend Configuration

- [ ] `src/config.js` uses `import.meta.env.VITE_*` variables
- [ ] All API calls use `API_BASE_URL` from config
- [ ] Admin password read from config, not hardcoded

## ✅ Documentation

- [ ] `README.md` updated with secure setup instructions
- [ ] `SECURITY.md` created with security guidelines
- [ ] `DEPLOYMENT.md` created with deployment instructions
- [ ] `.env.example` includes all required variables

## ✅ GitHub Configuration

- [ ] GitHub Actions workflow created (`.github/workflows/deploy.yml`)
- [ ] Instructions for setting GitHub Secrets documented
- [ ] No sensitive data in workflow files

## Verification Commands

Run these commands to verify no credentials are in source:

```bash
# Check for hardcoded IPs (should only find examples in README)
grep -r "192\.168\." src/ server.js

# Check for old API keys (should return nothing)
grep -r "10AXi3Q7KS1pahcNfKEcL4nk5qp34huX" src/ server.js

# Check for old Plex token (should return nothing)
grep -r "UpzFaq1sn2w6E-zNy5oa" src/ server.js

# Check for hardcoded passwords (should only find 'admin' as default)
grep -r "const.*PASSWORD.*=" src/
```

## Final Steps

1. Review all changes: `git status`
2. Test locally with `.env` file
3. Verify build works: `npm run build`
4. Commit changes
5. Push to GitHub

**Remember**: Never force push if credentials were accidentally committed. Instead, rotate the credentials and use git history rewriting tools.


