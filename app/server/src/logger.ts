import winston, { createLogger, format, transports } from "winston";

// Define custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3, // For HTTP logs
    verbose: 4,
    debug: 5,
    silly: 6,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    verbose: "cyan",
    debug: "blue",
    silly: "gray",
  },
};

// Add colors to Winston
winston.addColors(customLevels.colors);

// Create a custom log format
const logFormat = format.printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}] : ${stack || message}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  return log;
});

// Create a Winston logger
const logger = createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"), // Adjust log level based on environment
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Add timestamps
    format.errors({ stack: true }), // Include stack trace for errors
    format.splat(), // Enable string interpolation
    logFormat // Apply custom format
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize({ all: true }), // Colorize all logs
        logFormat
      ),
    }),
    // Uncomment and configure file transports if needed
    // new transports.File({ filename: "logs/app.log", level: "info" }),
    // new transports.File({ filename: "logs/errors.log", level: "error" }),
  ],
  exceptionHandlers: [
    // Uncomment and configure if logging exceptions to files
    // new transports.File({ filename: "logs/exceptions.log" }),
  ],
  rejectionHandlers: [
    // Uncomment and configure if logging rejections to files
    // new transports.File({ filename: "logs/rejections.log" }),
  ],
  exitOnError: false, // Do not exit on handled exceptions
});

// Export the logger
export default logger;
