import axios from "axios"
const MPC_URL = process.env.MPC_URL || "http://mpc-node-0:8080";
const mpc_nodes = MPC_URL.split(",").map(s => s.trim());

const main = async () => {
  try {
    console.log(">>> sending pings")
    mpc_nodes.forEach(async (url: string) => {
      const { data } = await axios.get(`${url}/`)
      console.log(data)
    })
  } catch (err) {
    console.log("::err", err, "end::")
  }
}

main()
