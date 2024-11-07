import { Web3, HttpProvider } from "web3";
import { rpc } from "viem/utils";

/**
 * generate random string
 * @returns STRING
 */
export const generateRandomString = (): string => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const _getWeb3 = async (rpcList: string[]) => {
  for (let i = 0; i < rpcList.length; i++) {
    const rpcUrl = rpcList[i];
    console.log(rpcUrl);
    const web3 = new Web3(new HttpProvider(String(rpcUrl)));
    try {
      await web3.eth.net.isListening();
      return Promise.resolve(web3);
    } catch (err) {
      console.log("next rpc...");
    }
  }
  return Promise.reject("cannot connect");
};

/**
 *
 * @param number
 * @returns
 */
export const localeNumber = (number: number | string) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 18,
    useGrouping: false, // Disable commas
  }).format(Number(number));
};
