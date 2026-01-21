# Indusmind Backend

Backend API for Indusmind Dashboard - ThingsBoard telemetry integration with Node.js, Express, and TypeScript.

## 🚀 Production Deployment

**Live API:** [https://indusmind-backend-production.up.railway.app](https://indusmind-backend-production.up.railway.app)

**Health Check:** [https://indusmind-backend-production.up.railway.app/health](https://indusmind-backend-production.up.railway.app/health)

**Platform:** Railway.app

---

## 📋 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check endpoint |
| `/telemetry/:deviceUUID/timeseries` | GET | Get device telemetry data |
| `/customer` | GET | Customer API proxy |
| `/auth` | POST | Authentication endpoints |
| `/users` | GET/POST | User management |

---

## 🛠️ Tech Stack

- **Runtime:** Node.js 18
- **Framework:** Express.js
- **Language:** TypeScript
- **Deployment:** Railway (Docker)
- **Integration:** ThingsBoard IoT Platform

---

## 🏗️ Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- ThingsBoard credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/Avempace-Wireless/indusmind-backend.git
cd indusmind-backend

# Install dependencies
npm install

# Copy environment variables
cp .env.production.example .env.production

# Edit .env.production with your credentials
# THINGSBOARD_BASE_URL=https://portal.indusmind.net
# THINGSBOARD_USERNAME=your-username
# THINGSBOARD_PASSWORD=your-password
```

### Run Locally

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

Server will start on `http://localhost:4000`

---

## 🐳 Docker Deployment

### Build Docker Image

```bash
docker build -t indusmind-backend:latest .
```

### Run Container

```bash
docker run -p 4000:4000 \
  -e THINGSBOARD_BASE_URL=https://portal.indusmind.net \
  -e THINGSBOARD_USERNAME=your-username \
  -e THINGSBOARD_PASSWORD=your-password \
  -e NODE_ENV=production \
  indusmind-backend:latest
```

---

## 🚂 Railway Deployment

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy

1. Push to `main` branch
2. Railway auto-deploys from GitHub
3. Environment variables managed in Railway dashboard
4. URL: `https://indusmind-backend-production.up.railway.app`

---

## 📚 Documentation

- [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)

---

## 🔒 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `THINGSBOARD_BASE_URL` | ThingsBoard portal URL | ✅ Yes |
| `THINGSBOARD_USERNAME` | ThingsBoard login username | ✅ Yes |
| `THINGSBOARD_PASSWORD` | ThingsBoard login password | ✅ Yes |
| `NODE_ENV` | Environment (`development`, `production`) | ✅ Yes |
| `PORT` | Server port (default: 4000) | ❌ No |
| `LOG_LEVEL` | Log level (`info`, `debug`, etc.) | ❌ No |

---

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📝 License

Private - Avempace Wireless

---

## 👥 Team

- **Organization:** Avempace Wireless
- **Project:** Indusmind Dashboard
- **Repository:** [github.com/Avempace-Wireless/indusmind-backend](https://github.com/Avempace-Wireless/indusmind-backend)
