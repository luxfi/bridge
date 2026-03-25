import express, { Express, Request, Response, NextFunction } from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import morgan from "morgan"
import helmet from "helmet"
import { v4 as uuidv4 } from "uuid"

import logger from "@/logger" // Import Winston logger
import swaps from "@/routes/swaps"
import explorer from "@/routes/explorer"
import settings from "@/routes/settings"
import tokens from "@/routes/tokens"
import limits from "@/routes/limits"
import quote from "@/routes/quote"
import rate from "@/routes/rate"
// Utila/Fireblocks disabled — using native MPC only
// import utila from "@/routes/utila"
import networks from "@/routes/networks"
import exchanges from "@/routes/exchanges"
import { mpcService } from "@/services/mpc-service"
import { bridgeMPC } from "@/domain/mpc-bridge"
import { startTeleportProcessor } from "@/domain/teleport-processor"

try {
  dotenv.config()

  const app: Express = express()
  const port: number = process.env.PORT ? Number(process.env.PORT) : 5000

  logger.info(">> Server Initialization Started")

  // Security: remove X-Powered-By header, add security headers
  app.disable('x-powered-by')
  app.use(helmet({
    contentSecurityPolicy: false,        // managed by frontend
    crossOriginEmbedderPolicy: false,    // bridge needs cross-origin
  }))

  // Behind Proxy
  app.set('trust proxy', true)

  // Middleware to assign a unique ID to each request
  const REQUEST_ID = Symbol('requestId')
  app.use((req, res, next) => {
    (req as any)[REQUEST_ID] = uuidv4()
    next()
  })

  // Middleware
  app.use(cors({
    origin: ['https://bridge.lux.network', /\.lux\.(network|exchange)$/],
  }))
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
  }))
  app.use(express.urlencoded({ extended: true }))

  morgan.token('referrer', (req) => req.headers['referer'] || '-')
  morgan.token('origin', (req) => req.headers['origin'] || '-')
  morgan.token('device', (req) => req.headers['user-agent'] || '-')
  morgan.token('id',     (req) => (req as any)[REQUEST_ID] || '-')

  // HTTP request logging
  // const customFormat = ':id :remote-addr - :method :url HTTP/:http-version" :status :res[content-length] ":referrer" "Origin: :origin" "User-Agent: :device"'
  // app.use(
  //   morgan(customFormat, {
  //     stream: {
  //       write: (message: string) => logger.http(message.trim()),
  //     },
  //   })
  // )

  // app.use((req, res, next) => {
  //   logger.info('Request Headers:', req.headers)
  //   logger.info('Request Body:', req.body)
  //   next()
  // })

  // Parses incoming JSON requests and puts the parsed data in req.body
  app.use(express.json({
    verify: (req, res, buf) => {
      // Capture the raw request body
      (req as any).rawBody = buf.toString('utf8')
    },
  }))
  // Add all routes
  app.use("/api/swaps", swaps)
  app.use("/api/explorer", explorer)
  app.use("/api/settings", settings)
  app.use("/api/tokens", tokens)
  app.use("/api/limits", limits)
  app.use("/api/quote", quote)
  app.use("/api/rate", rate)
  app.use("/api/networks", networks)
  app.use("/api/exchanges", exchanges)

  // Root endpoint — proper health check, no internal details
  app.get("/", (req: Request, res: Response) => {
    res.json({
      service: "lux-bridge",
      status: "ok",
      timestamp: new Date().toISOString()
    })
  })

  // Health endpoint
  app.get("/health", async (req: Request, res: Response) => {
    try {
      const mpcStatus = await mpcService.getNetworkStatus()
      res.json({
        status: "healthy",
        mpc: mpcStatus,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      })
    }
  })

  // Add a 404 handler for unmatched routes
  app.use((req, res) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`)
    res.status(404).send("Not Found")
  })

  // Global error handling middleware
  // SECURITY: Never expose stack traces or internal error details to clients.
  // Log the full error server-side, return only a generic message + requestId.
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4()
    if (err instanceof Error) {
      logger.error(`Error: ${err.message}`, { stack: err.stack, requestId, path: req.originalUrl })
    } else {
      logger.error(`Unknown Error: ${err}`, { requestId, path: req.originalUrl })
    }
    res.status(500).json({ error: "Internal Server Error", requestId })
  })

  // Start the server
  app.listen(port, async () => {
    logger.info(`>> Server Is Running On Port ${port}`)
    
    // Initialize MPC signing service (NATS-based, used for bridge getsig endpoint)
    // Wallet creation uses HTTP to MPC API directly via mpc-wallet.ts
    try {
      logger.info("Initializing MPC signing service...")
      await mpcService.initialize()
      await bridgeMPC.initialize()
      logger.info("MPC signing service initialized successfully")
    } catch (error) {
      logger.warn("MPC signing service initialization failed (wallet creation still works via HTTP):", error)
    }

    // Start background processor for teleporter swaps stuck in TeleportProcessPending
    startTeleportProcessor()
  })
} catch (error) {
  // Catch any initialization errors
  if (error instanceof Error) {
    logger.error("Fatal startup error", { message: error.message, stack: error.stack })
  } else {
    logger.error("Fatal startup error: Unknown error", { error })
  }
  process.exit(1)
}
