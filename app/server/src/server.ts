import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";

import logger from "@/logger"; // Import Winston logger

// Routers
import swaps from "@/routes/swaps";
import explorer from "@/routes/explorer";
import settings from "@/routes/settings";
import tokens from "@/routes/tokens";
import limits from "@/routes/limits";
import quotes from "@/routes/quotes";
import rate from "@/routes/rate";
import networks from "@/routes/networks";
import exchanges from "@/routes/exchanges";
import utila from "@/routes/utila";

try {
  dotenv.config();

  const app: Express = express();
  const port: number = process.env.PORT ? Number(process.env.PORT) : 5000;

  logger.info("Server initialization started...");

  // Behind Proxy
  app.set('trust proxy', true);


  // Middleware to assign a unique ID to each request
  const REQUEST_ID = Symbol('requestId');
  app.use((req, res, next) => {
    (req as any)[REQUEST_ID] = uuidv4();
    next();
  });

  // Middleware
  app.use(cors());
  app.use(express.urlencoded({ extended: true }));

  morgan.token('referrer', (req) => req.headers['referer'] || '-');
  morgan.token('origin', (req) => req.headers['origin'] || '-');
  morgan.token('device', (req) => req.headers['user-agent'] || '-');

  const customFormat = ':remote-addr - :method :url HTTP/:http-version" :status :res[content-length] ":referrer" "Origin: :origin" "User-Agent: :device"';

  // HTTP request logging
  app.use(
    morgan(customFormat, {
      stream: {
        write: (message: string) => logger.http(message.trim()),
      },
    })
  );

  app.use((req, res, next) => {
    logger.info('Request Headers:', req.headers);
    logger.info('Request Body:', req.body);
    next();
  });

  // Backwards compatibility for legacy webhook paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.path === "/webhook/utila") {
      logger.info(`Rewriting request path: ${req.path} -> /v1/utila/webhook`);
      req.url = "/v1/utila/webhook"; // Rewrite the request path
    }
    next();
  });

  // Use raw body for /v1/utila webhook
  app.use("/v1/utila", express.raw({ type: "*/*", limit: "10mb" }));

  // Use JSON body parsing for other routes
  app.use(express.json());

  // Add all routes
  app.use("/api/swaps", swaps);
  app.use("/api/explorer", explorer);
  app.use("/api/settings", settings);
  app.use("/api/tokens", tokens);
  app.use("/api/limits", limits);
  app.use("/api/quotes", quotes);
  app.use("/api/rate", rate);
  app.use("/api/networks", networks);
  app.use("/api/exchanges", exchanges);
  app.use("/v1/utila", utila);

  // Root endpoint
  app.get("/", (req: Request, res: Response) => {
    logger.info("Root endpoint accessed");
    res.send("Hello, Winston Logger!");
  });

  // Add a 404 handler for unmatched routes
  app.use((req, res) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).send("Not Found");
  });

  // Global error handling middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4();
    if (err instanceof Error) {
      logger.error(`Error: ${err.message}`, { stack: err.stack, requestId });
      res.status(500).json({ error: err.message, stack: err.stack, requestId });
    } else {
      logger.error(`Unknown Error: ${err}`, { requestId });
      res.status(500).json({ error: "Internal Server Error", requestId });
    }
  });

  // Start the server
  app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });
} catch (error) {
  // Catch any initialization errors
  if (error instanceof Error) {
    logger.error("Fatal startup error", { message: error.message, stack: error.stack });
  } else {
    logger.error("Fatal startup error: Unknown error", { error });
  }
  process.exit(1);
}
