# Railway Deployment Guide

This backend is configured for deployment to [Railway.app](https://railway.app).

## Prerequisites

- Railway account (free tier available at https://railway.app)
- GitHub repository connected to Railway
- Node.js 18+ locally (for testing)

## Environment Variables

Set these in Railway's dashboard under **Variables**:

```
THINGSBOARD_BASE_URL=https://portal.indusmind.net
THINGSBOARD_USERNAME=indusmind.admin@indusmind.io
THINGSBOARD_PASSWORD=IndrT--968$$$1dfvcJUIop
NODE_ENV=production
PORT=3000
```

## Deployment Steps

### Option 1: Auto-Deploy from GitHub (Recommended)

1. Push your code to `main` branch:
   ```bash
   git push origin main
   ```

2. Go to https://railway.app/dashboard

3. Click **Create New** → **Project from GitHub Repo**

4. Select `Avempace-Wireless/indusmind-backend`

5. Railway will automatically:
   - Detect the Dockerfile
   - Build the Docker image
   - Deploy to a container
   - Assign a public URL

6. Set environment variables:
   - Go to **Variables** tab
   - Add the 4 variables listed above

7. Railway will auto-redeploy with the new variables

### Option 2: Local Docker Testing

Before deploying, test locally:

```bash
# Build Docker image
docker build -t indusmind-backend:latest .

# Run container with env vars
docker run -p 3000:3000 \
  -e THINGSBOARD_BASE_URL=https://portal.indusmind.net \
  -e THINGSBOARD_USERNAME=indusmind.admin@indusmind.io \
  -e THINGSBOARD_PASSWORD=IndrT--968$$$1dfvcJUIop \
  -e NODE_ENV=production \
  indusmind-backend:latest

# Test health endpoint
curl http://localhost:3000/health
```

## Getting Your Production URL

Once deployed to Railway:

1. Go to https://railway.app/dashboard
2. Click your **indusmind-backend** project
3. Click **Deployments** tab
4. Copy the **Public URL** (looks like `https://indusmind-backend-production-xxx.railway.app`)

Use this URL to update your frontend's `VITE_API_URL` environment variable.

## Monitoring & Logs

- **Logs**: Dashboard → Deployments → Click deployment → View Logs
- **Metrics**: Dashboard → Metrics tab (CPU, Memory, Request count)
- **Status**: Automatic health checks every 30 seconds

## Troubleshooting

**Build fails with "npm run build" error:**
- Check build logs in Railway dashboard
- Ensure all dependencies in `package.json` are correct
- Verify TypeScript configuration (`tsconfig.build.json`)

**Container crashes after deploy:**
- Check environment variables are set correctly
- View logs: Dashboard → Logs tab
- Ensure `NODE_ENV=production` is set

**Telemetry API not responding:**
- Verify `THINGSBOARD_BASE_URL`, `THINGSBOARD_USERNAME`, `THINGSBOARD_PASSWORD`
- Test locally first with `docker run` to isolate the issue

## Cost

Railway offers:
- **Free tier**: $5/month free credit (usually enough for small projects)
- **Pay-as-you-go**: After free credit, billed for actual usage
- No charges during development/preview deployments

Check your usage at https://railway.app/account/billing
