import express, { Express, Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
//routers
import swaps from "@/routes/swaps"
import db from "@/routes/db"
import explorer from "@/routes/explorer"

dotenv.config()

const app: Express = express()
const port: number = process.env.PORT ? Number(process.env.PORT) : 8080

app.use(express.json())
app.use(cors())
app.use(express.urlencoded({ extended: true }))

app.use("/api/swaps", swaps)
app.use("/api/db", db)
app.use("/api/explorer", explorer)

app.listen(port, "0.0.0.0", function () {
  console.log(`>> Server is Running At: Port ${port}`)
})
