import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = "1234";
  res.status(200).json({
    data: { 
        swap_id: id 
    }
  });
}
