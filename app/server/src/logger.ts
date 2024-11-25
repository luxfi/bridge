import { createLogger, format, transports } from "winston";

// Define custom formats
const { combine, timestamp, printf, colorize, errors } = format;

// Create a custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  return log;
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
    // Comment out file transports if you don't want to log to files
    // new transports.File({ filename: "logs/app.log", level: "info" }),
    // new transports.File({ filename: "logs/errors.log", level: "error" }),
  ],
  exceptionHandlers: [
    // Comment out exception handlers if not logging to files
    // new transports.File({ filename: "logs/exceptions.log" }),
  ],
  rejectionHandlers: [
    // Comment out rejection handlers if not logging to files
    // new transports.File({ filename: "logs/rejections.log" }),
  ],
});

// Remove logs directory creation if not logging to files
// import fs from "fs";
// import path from "path";
// const logsDir = path.join(__dirname, "logs");
// if (!fs.existsSync(logsDir)) {
//   fs.mkdirSync(logsDir);
// }

export default logger;
