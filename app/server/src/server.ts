import express, { Express, Request, Response, NextFunction } from "express"
import cors from "cors"
import dotenv from "dotenv"
import morgan from "morgan"
import { v4 as uuidv4 } from "uuid"

import logger from "@/logger" // Import Winston logger
import swaps from "@/routes/swaps"
import explorer from "@/routes/explorer"
import settings from "@/routes/settings"
import tokens from "@/routes/tokens"
import limits from "@/routes/limits"
import quote from "@/routes/quote"
import rate from "@/routes/rate"
import utila from "@/routes/utila"
import networks from "@/routes/networks"
import exchanges from "@/routes/exchanges"
import { mpcService } from "@/services/mpc-service"
import { bridgeMPC } from "@/domain/mpc-bridge"

try {
  dotenv.config()

  const app: Express = express()
  const port: number = process.env.PORT ? Number(process.env.PORT) : 5000

  logger.info(">> Server Initialization Started")

  // Behind Proxy
  app.set('trust proxy', true)

  // Middleware to assign a unique ID to each request
  const REQUEST_ID = Symbol('requestId')
  app.use((req, res, next) => {
    (req as any)[REQUEST_ID] = uuidv4()
    next()
  })

  // Middleware
  app.use(cors())
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

  // Backwards compatibility for legacy webhook paths
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.path === "/webhook/utila") {
      logger.info(`Rewriting request path: ${req.path} -> /v1/utila/webhook`)
      req.url = "/v1/utila/webhook" // Rewrite the request path
    }
    next()
  })

  // add utila webhook router
  app.use("/v1/utila", utila)
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

  // Root endpoint
  app.get("/", (req: Request, res: Response) => {
    logger.info("Root endpoint accessed")
    res.send("Hello, Winston Logger!")
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
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4()
    if (err instanceof Error) {
      logger.error(`Error: ${err.message}`, { stack: err.stack, requestId })
      res.status(500).json({ error: err.message, stack: err.stack, requestId })
    } else {
      logger.error(`Unknown Error: ${err}`, { requestId })
      res.status(500).json({ error: "Internal Server Error", requestId })
    }
  })

  // Start the server
  app.listen(port, async () => {
    logger.info(`>> Server Is Running On Port ${port}`)
    
    // Initialize MPC service
    try {
      logger.info("Initializing MPC service...")
      await mpcService.initialize()
      await bridgeMPC.initialize()
      logger.info("MPC service initialized successfully")
    } catch (error) {
      logger.error("Failed to initialize MPC service:", error)
    }
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
