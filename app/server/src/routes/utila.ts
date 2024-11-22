//import { handlerGetExplorer, handlerGetHasBySwaps } from "@/helpers/swapHelper"
import { Router, Request, Response } from "express"
import jwt from 'jsonwebtoken';

import { mainnetSettings, testnetSettings } from "@/settings"

const router: Router = Router()

function generateToken() {
  const options = <jwt.SignOptions>{
    subject: process.env.SERVICE_ACCOUNT_EMAIL,
    audience: "https://api.utila.io/",
    expiresIn: "1h",
    algorithm: <jwt.Algorithm>"RS256",
  };
  return jwt.sign({}, process.env.SERVICE_ACCOUNT_PRIVATE_KEY as string, options);
}

// route: /api/utila/
// description:
// method: GET and it's public
router.get("/", async (req: Request, res: Response) => {
  try {

    const token = generateToken ()
    console.log(token)

    res.status(200).json({ data: token })
  } 
  catch (error: any) {
    console.log(error)
    res.status(500).json({ error: error })
  }
})


export default router
