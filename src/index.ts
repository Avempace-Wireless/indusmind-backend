import { createApp } from "./app.js";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";

const app = createApp();

// For local development and serverless export
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  // Local server mode
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
}

// Export for Vercel serverless
export default app;
