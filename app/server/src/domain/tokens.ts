import axios from "axios"

/**
 * get token price using coinbase api
 * @param token_id token ID
 */
export const getTokenPrice = async (token_id: string) => {
  try {
    const headers = {
      "x-api-key": process.env.COINBASE_API_KEY,
      accept: "application/json",
    }
    if (token_id === "LUX") {
      return 0.0011
    } 
    else if (token_id === "ZOO") {
      return 0.000021
    } 
    else if (token_id === "LUSD" || token_id === 'ZUSD') {
      return 1.0
    } 
    else if (token_id.startsWith("L") || token_id.startsWith("Z")) {
      const _token_id = token_id.slice(1)
      const {
        data: { data },
      } = await axios.get(
        `https://api.coinbase.com/v2/prices/${_token_id}-USD/buy`,
        { headers }
      )
      return Number(data.amount)
    } 
    else {
      const {
        data: { data },
      } = await axios.get(
        `https://api.coinbase.com/v2/prices/${token_id}-USD/buy`,
        { headers }
      )
      return Number(data.amount)
    }
  } 
  catch (err) {
    console.log("::not found token pice in coinbase", token_id)
    return 1
  }
}
