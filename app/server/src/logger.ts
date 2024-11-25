import { createLogger, format, transports } from "winston";

// Define custom formats
const { combine, timestamp, printf, colorize, errors } = format;

// Create a custom log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Create a Winston logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || "debug", // Default log level
  format: combine(
    colorize(), // Add colors to log levels
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Add timestamps
    errors({ stack: true }), // Include stack trace for errors
    logFormat // Apply custom format
  ),
  transports: [
    new transports.Console(), // Log to the console
    new transports.File({ filename: "logs/app.log", level: "info" }), // Log info and above to app.log
    new transports.File({ filename: "logs/errors.log", level: "error" }), // Log errors to errors.log
  ],
  exceptionHandlers: [
    new transports.File({ filename: "logs/exceptions.log" }), // Log uncaught exceptions
  ],
  rejectionHandlers: [
    new transports.File({ filename: "logs/rejections.log" }), // Log unhandled promise rejections
  ],
});

// Ensure logs directory exists
import fs from "fs";
import path from "path";
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

export default logger;
