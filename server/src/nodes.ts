import axios from "axios"
const mpc_nodes = ["http://mpc-node-0:6000", "http://mpc-node-1:6000", "http://mpc-node-2:6000"]
// const mpc_nodes = ["https://teleport-0.lux.network", "https://teleport-1.lux.network", "https://teleport-2.lux.network"]

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
