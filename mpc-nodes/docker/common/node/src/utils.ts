import Web3 from "web3"
import dotenv from "dotenv"
import find from "find-process"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { recoverAddress } from "ethers"
import { promisify } from "util"
import { exec as childExec } from "child_process"
import { settings } from "./config"
import { SIGN_REQUEST } from "./types"

const exec = promisify(childExec)
dotenv.config()

const signClientName = process.env.sign_client_name
const signSmManager = process.env.sign_sm_manager
/* SM Manager Timeout Params */
// const smTimeOutBound = (Number(settings.SMTimeout) * 100 * Math.random()) % 60 //0.5
const smTimeOutBound = Number(process.env.smTimeOutBound)
/** key share for this node */
const keyStore = settings.KeyStore

const killSigner = async (signerProc: string) => {
  try {
    console.log("::Killing Signer..")
    const cmd = "kill -9 " + signerProc
    const out = await exec(cmd)
    console.log("::Signer dead...", out)
  } catch (e) {
    console.log("::Signer process already dead:", e)
  }
}

/**
 * get WEB3 object by given network's rpc url
 * @param rpcUrl
 * @returns
 */
export const getWeb3FormForRPC = (rpcUrl: string) => {
  try {
    const _web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl))
    return _web3
  } catch (err) {
    return null
  }
}

/**
 * generate signature
 * @param i 
 * @param msgHash 
 * @returns 
 */
export const signClient = async (i: number, msgHash: string) =>
  new Promise(async (resolve, reject) => {
    try {
      console.log("========================================================= In Sign Client ============================================================")
      const list = await find("name", `${signClientName} ${signSmManager}`)
      if (list.length > 0) {
        console.log("::clientAlreadyRunning:::", list)
        try {
          const x = list.length === 1 ? 0 : 1
          const uptimeCmd = "ps -p " + list[x].pid + " -o etime"
          const uptimeOut = await exec(uptimeCmd)
          const upStdout = uptimeOut.stdout
          const upStderr = uptimeOut.stderr

          if (upStdout) {
            const up = upStdout.split("\n")[1].trim().split(":")
            console.log("::upStdout:", up, "Time Bound:", smTimeOutBound)
            const upStdoutArr = up
            // SM Manager timed out
            if (Number(upStdoutArr[upStdoutArr.length - 1]) >= smTimeOutBound) {
              console.log("::SM Manager signing timeout reached")
              try {
                // await killSigner(signClientName)
                for (const p of list) {
                  await killSigner(String(p.pid))
                }
                const cmd = `./target/release/examples/${signClientName} ${signSmManager} ${keyStore} ${msgHash}`
                await exec(cmd, { cwd: __dirname + "/multiparty", shell: "/bin/bash" }) // Make sure it"s dead
              } catch (err) {
                console.log("::Partial signature process may not have exited:", err)
                resolve(signClient(i, msgHash))
                //reject("SignerKill: Try transaction again with new nonce.")
                return
              }
            } else {
              //Loop SM Mangers
              i = 0
              resolve(signClient(i, msgHash))
              return
            }
          } else {
            console.log("::upStderr:", upStderr)
            reject("::SignerDeadError2:" + upStderr)
            return
          }
        } catch (err) {
          console.log("::SignerDeadError3:", err)
          reject("SignerDeadError3:" + err)
          return
        }
      } else {
        console.log("About to message signers...")
        try {
          //Invoke client signer
          console.log("::signSmManager", signSmManager, i)
          const cmd = `./target/release/examples/${signClientName} ${signSmManager} ${keyStore} ${msgHash}`
          console.log("::command: ", cmd)
          const out = await exec(cmd, { cwd: __dirname + "/multiparty" }) // Make sure it"s dead
          const { stdout, stderr } = out
          console.log("::stdout:", stdout, stderr)
          if (stdout) {
            const sig = stdout.split("sig_json")[1].split(",")
            if (sig.length > 0) {
              const r = sig[0].replace(": ", "").replace(/["]/g, "").trim()
              const s = sig[1].replace(/["]/g, "").trim()
              const v = Number(sig[2].replace(/["]/g, "")) === 0 ? "1b" : "1c"
              let signature = "0x" + r + s + v
              if (signature.length < 132) {
                throw new Error("elements in xs are not pairwise distinct")
              }
              // Handle odd length sigs
              if (signature.length % 2 != 0) {
                signature = "0x0" + signature.split("0x")[1]
              }

              console.log("::Signature3:", signature)
              resolve({ r, s, v, signature })
              return
            }
          } else {
            console.log("::stderr:" + stderr)
            reject("SignerFailError1:" + stderr)
            return
          }
        } catch (err) {
          console.log("::SignerFailError2:" + err)

          if (err.toString().includes("elements in xs are not pairwise distinct")) {
            await sleep(2000)
            resolve(signClient(i, msgHash))
            return
          } else {
            reject("SignerFailError2: " + err)
            return
          }
        }
      }
      return
    } catch (err) {
      console.log("::sign cilent error: =======================")
      console.log(err.stack || err)
      reject(err.stack)
      return
    }
  })

/**
 * sign message
 * @param message
 * @param web3
 * @returns
 */
export const signMessage = async (message: string, web3: Web3<RegisteredSubscription>) => {
  try {
    // console.log("::hashed msg to sign", message)
    // const sig = web3.eth.accounts.sign(message, "0x00...") //0x84326CC39D69471b35A38aaAA9980eE0E6Ab5959
    // const { signature, messageHash, r, s, v } = sig
    // const myMsgHashAndPrefix = web3.eth.accounts.hashMessage(message)
    // const signer = recoverAddress(myMsgHashAndPrefix, signature)
    // console.log("MPC Address:", signer)
    // return Promise.resolve({ signature, signer })

    const myMsgHashAndPrefix = web3.eth.accounts.hashMessage(message)
    const netSigningMsg = myMsgHashAndPrefix.substr(2)
    const i = 0
    try {
      const { signature, r, s, v } = (await signClient(i, netSigningMsg)) as any
      let signer = ""
      try {
        signer = recoverAddress(myMsgHashAndPrefix, signature)
        console.log("MPC Address:", signer)
      } catch (err) {
        console.log("err: ", err)
      }
      return Promise.resolve({ signature, signer })
    } catch (err) {
      console.log("Error:", err)
      return Promise.reject("signClientError:")
    }
  } catch (err) {
    console.log("Error:", err)
    return Promise.reject(err)
  }
}

/**
 * Concatenate the message to be hashed.
 * @param toNetworkIdHash
 * @param txIdHash
 * @param toTokenAddress
 * @param tokenAmount
 * @param decimals
 * @param receiverAddressHash
 * @param vault
 * @returns merged msg
 */
export const concatMsg = (toNetworkIdHash: string, hashedTxId: string, toTokenAddress: string, tokenAmount: string, decimals: number, receiverAddressHash: string, vault: boolean) => {
  return toNetworkIdHash + hashedTxId + toTokenAddress + tokenAmount + decimals + receiverAddressHash + vault
}

/**
 * hash tx
 * @param param0
 * @returns
 */
export const hashAndSignTx = async ({ web3Form, vault, toNetworkId, hashedTxId, toTokenAddress, tokenAmount, decimals, receiverAddressHash, nonce }: SIGN_REQUEST) => {
  try {
    const toNetworkIdHash = Web3.utils.keccak256(toNetworkId)
    const toTokenAddressHash = Web3.utils.keccak256(toTokenAddress)
    const message = concatMsg(toNetworkIdHash, hashedTxId, toTokenAddressHash, tokenAmount, decimals, receiverAddressHash, vault)
    console.log("::message to sign: ", message)
    const hash = web3Form.utils.soliditySha3(message)
    const { signature, signer } = await signMessage(hash, web3Form)
    return Promise.resolve({ signature, mpcSigner: signer })
  } catch (err) {
    if (err.toString().includes("invalid point")) {
      hashAndSignTx({ web3Form, vault, toNetworkId, hashedTxId, toTokenAddress, tokenAmount, decimals, receiverAddressHash, nonce })
    } else {
      console.log(err)
      return Promise.reject(err)
    }
  }
}

/**
 * await for miliseconds
 * @param millis
 * @returns
 */
export const sleep = async (millis: number) => new Promise((resolve) => setTimeout(resolve, millis))
