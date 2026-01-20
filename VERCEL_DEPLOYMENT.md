# Backend Vercel Deployment Guide

## Prerequisites
- Vercel account (https://vercel.com)
- Vercel CLI installed: `npm install -g vercel`
- Git pushed to GitHub/GitLab

## Environment Variables Required

Set these in Vercel dashboard or via CLI:

```
THINGSBOARD_BASE_URL=https://portal.indusmind.net
THINGSBOARD_USERNAME=your-thingsboard-username
THINGSBOARD_PASSWORD=your-thingsboard-password
NODE_ENV=production
```

## Deployment Methods

### Method 1: Via Vercel Dashboard (Recommended)

1. Go to [https://vercel.com](https://vercel.com)
2. Click "New Project"
3. Select your repository (GitHub/GitLab)
4. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `indusmind-backend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables (Settings → Environment Variables)
6. Click "Deploy"

### Method 2: Via Vercel CLI

```bash
# Login to Vercel
vercel login

# Navigate to backend directory
cd indusmind-backend

# Deploy to production
vercel --prod

# Enter environment variables when prompted
```

### Method 3: Automatic Deployments

Once connected to GitHub/GitLab:
- Every push to `main` branch → auto-deploys to production
- Every push to other branches → auto-deploys to preview

## After Deployment

### 1. Get Your Backend URL

From Vercel dashboard, copy your production URL:
- Format: `https://your-app-name.vercel.app`

### 2. Update Frontend `.env`

In `indusmind-dashboard/.env`:

```
VITE_API_URL=https://your-app-name.vercel.app
```

Or in `indusmind-dashboard/.env.production`:

```
VITE_API_URL=https://your-app-name.vercel.app
```

### 3. Verify APIs Work

Test endpoint:
```bash
curl https://your-app-name.vercel.app/health
```

Should return:
```json
{ "status": "ok" }
```

## Troubleshooting

### Cold Starts
- Normal on first request (2-5 seconds)
- Subsequent requests are fast

### Environment Variables Not Loaded
```bash
# Check Vercel settings
vercel env ls

# Re-add variables
vercel env add THINGSBOARD_BASE_URL
vercel env add THINGSBOARD_USERNAME
vercel env add THINGSBOARD_PASSWORD
```

### Build Fails
Check logs:
```bash
vercel logs --prod
```

### CORS Issues
Backend is already configured with CORS. If still issues:
- Check `src/app.ts` CORS settings
- Verify frontend URL in allowed origins

## Monitoring & Logs

```bash
# View production logs
vercel logs --prod

# View function execution
vercel logs --prod --follow

# Check function performance
vercel analytics
```

## Rollback

If deployment has issues:

```bash
# View deployment history
vercel list

# Rollback to previous
vercel rollback
```

## Custom Domain (Optional)

1. Go to Vercel Project Settings → Domains
2. Add your custom domain
3. Update DNS records with Vercel provider instructions
4. Update frontend API URL to use custom domain
