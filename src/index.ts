import { createApp } from "./app.js";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";

const app = createApp();

async function start() {
  const server = app.listen(config.port);

  server.on("error", (err) => {
    logger.error("Server error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

start();
