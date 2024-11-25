import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import logger from "./logger"; // Import Winston logger

dotenv.config();

const app: Express = express();
const port: number = process.env.PORT ? Number(process.env.PORT) : 5000;

logger.info("Starting server initialization...");

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logging with Morgan integrated into Winston
app.use(
  morgan("combined", {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

// Test Middleware
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`);
  next();
});

// Root Endpoint
app.get("/", (req: Request, res: Response) => {
  logger.info("Root endpoint accessed");
  res.send("Hello, Winston Logger!");
});

// Global Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof Error) {
    logger.error(`Error: ${err.message}`, { stack: err.stack });
  } else {
    logger.error(`Unknown Error: ${err}`);
  }
  res.status(500).json({ error: "Internal Server Error" });
});

// Handle Uncaught Exceptions
process.on("uncaughtException", (error) => {
  if (error instanceof Error) {
    logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  } else {
    logger.error(`Uncaught Exception: ${error}`);
  }
  process.exit(1); // Exit after logging
});

// Handle Unhandled Promise Rejections
process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    logger.error(`Unhandled Rejection: ${reason.message}`, { stack: reason.stack });
  } else {
    logger.error(`Unhandled Rejection: ${reason}`);
  }
  process.exit(1); // Exit after logging
});

// Start the Server
try {
  app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });
} catch (error) {
  if (error instanceof Error) {
    logger.error("Failed to start the server", { message: error.message, stack: error.stack });
  } else {
    logger.error("Failed to start the server: Unknown error", { error });
  }
  process.exit(1);
}
