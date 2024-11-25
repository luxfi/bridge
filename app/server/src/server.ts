import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";

// Routers
import logger from "@/logger"; // Import Winston logger
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

  console.log("Starting server initialization...");
  logger.info("Server initialization started...");

  // Middleware
  app.use(express.json());
  app.use(cors());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    morgan("combined", {
      stream: {
        write: (message: string) => logger.http(message.trim()),
      },
    })
  );

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

  // for backwards compat
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.path === "/webhook/utila") {
      logger.info(`Rewriting request path: ${req.path} -> /v1/utila/webhook`);
      req.url = "/v1/utila/webhook"; // Rewrite the request path
    }
    next();
  });

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
    if (err instanceof Error) {
      logger.error(`Error: ${err.message}`, { stack: err.stack });
      res.status(500).json({ error: err.message, stack: err.stack });
    } else {
      logger.error(`Unknown Error: ${err}`);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    logger.info(`Server is running on port ${port}`);
  });
} catch (error) {
  // Catch any initialization errors
  console.error("Fatal startup error:", error);
  if (error instanceof Error) {
    logger.error("Fatal startup error", { message: error.message, stack: error.stack });
  } else {
    logger.error("Fatal startup error: Unknown error", { error });
  }
  process.exit(1);
}
