import { createApp } from "./app.js";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";

// Validate required environment variables before starting
function validateEnvironment() {
  const required = ['THINGSBOARD_BASE_URL', 'THINGSBOARD_USERNAME', 'THINGSBOARD_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error(
      { missing, provided: process.env },
      `Missing required environment variables: ${missing.join(', ')}`
    );
    console.error('❌ ERROR: Missing environment variables');
    missing.forEach(key => {
      console.error(`   - ${key} is not set`);
    });
    console.error('\nPlease set these environment variables in Railway dashboard:');
    console.error('  1. Go to https://railway.app/dashboard');
    console.error('  2. Select your indusmind-backend project');
    console.error('  3. Click Variables tab');
    console.error('  4. Add missing variables with their values');
    process.exit(1);
  }
}

validateEnvironment();

const app = createApp();

async function start() {
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Server error");
    process.exit(1);
  });
}

start();
