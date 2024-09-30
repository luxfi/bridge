import axios from 'axios';
/**
 * get token price using coinbase api
 * @param token_id token ID
 */
export const getTokenPrice = async (token_id: string) => {
  try {
    const headers = {
      'x-api-key': process.env.NEXT_PUBLIC_COINBASE_API_KEY,
      'accept': 'application/json'
    }
    if (token_id === 'LUX') {
      return 0.0011;
    } else if (token_id === 'LUSD') {
      return 1.0;
    } else {
      const { data: { data } } = await axios.get(`https://api.coinbase.com/v2/prices/${token_id}-USD/buy`, { headers });
      return Number(data.amount);
    }
  } catch (err) {
    console.log(err)
    return 1;
  }
}