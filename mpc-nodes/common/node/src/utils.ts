import Web3 from "web3"
import dotenv from "dotenv"
import find from "find-process"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { recoverAddress } from "ethers"
import { promisify } from "util"
import { exec as childExec } from "child_process"
import { settings } from "./config"

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
    console.log("Killing Signer..")
    const cmd = "kill -9 " + signerProc
    const out = await exec(cmd)
    console.log("Signer dead...", out)
  } catch (e) {
    console.log("Signer process already dead:", e)
  }
}

export const signClient = async (i: number, msgHash: string, txInfo: string[]) =>
  new Promise(async (resolve, reject) => {
    try {
      console.log("========================================================= In Sign Client ============================================================")
      const [txid, fromNetId, toNetIdHash, tokenName, tokenAddrHash, toTargetAddrHash, msgSig, nonce] = txInfo
      const txidNonce = txid + nonce
      const list = await find("name", `${signClientName} ${signSmManager}`)
      console.log("list", list);
      if (list.length > 0) {
        console.log("clientAlreadyRunning", list)
        try {
          const x = list.length === 1 ? 0 : 1
          const uptimeCmd = "ps -p " + list[x].pid + " -o etime"
          const uptimeOut = await exec(uptimeCmd)
          const upStdout = uptimeOut.stdout
          const upStderr = uptimeOut.stderr

          if (upStdout) {
            const up = upStdout.split("\n")[1].trim().split(":")
            console.log("upStdout:", up, "Time Bound:", smTimeOutBound)
            const upStdoutArr = up
            // SM Manager timed out
            if (Number(upStdoutArr[upStdoutArr.length - 1]) >= smTimeOutBound) {
              console.log("SM Manager signing timeout reached")
              try {
                // await killSigner(signClientName)
                for (const p of list) {
                  await killSigner(String(p.pid))
                }
                const cmd = `./target/release/examples/${signClientName} ${signSmManager} ${keyStore} ${msgHash}`
                await exec(cmd, { cwd: __dirname + "/multiparty", shell: '/bin/bash' }) // Make sure it"s dead
              } catch (err) {
                console.log("Partial signature process may not have exited:", err)
                resolve(signClient(i, msgHash, txInfo))
                //reject("SignerKill: Try transaction again with new nonce.")
                return
              }
            } else {
              //Loop SM Mangers
              i = 0
              resolve(signClient(i, msgHash, txInfo))
              return
            }
          } else {
            console.log("upStderr:", upStderr)
            reject("SignerDeadError2:" + upStderr)
            return
          }
        } catch (err) {
          console.log("SignerDeadError3:", err)
          reject("SignerDeadError3:" + err)
          return
        }
      } else {
        console.log("About to message signers...")
        try {
          //Invoke client signer
          console.log("signSmManager", signSmManager, i)
          const cmd = `./target/release/examples/${signClientName} ${signSmManager} ${keyStore} ${msgHash}`
          console.log("command: ", cmd)
          const out = await exec(cmd, { cwd: __dirname + "/multiparty" }) // Make sure it"s dead
          const { stdout, stderr } = out
          console.log("stdout:", stdout, stderr)
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

              console.log("Signature3:", signature)
              resolve({ r, s, v, signature })
              return
            }
          } else {
            console.log("stderr:" + stderr)
            reject("SignerFailError1:" + stderr)
            return
          }
        } catch (err) {
          console.log("SignerFailError2:" + err)

          if (err.toString().includes("elements in xs are not pairwise distinct")) {
            await sleep(2000)
            resolve(signClient(i, msgHash, txInfo))
            return
          } else {
            reject("SignerFailError2: " + err)
            return
          }
        }
      }
      return
    } catch (err) {
      console.log("sign cilent error: =======================")
      console.log(err.stack || err)
      reject(err.stack)
      return
    }
  })

/**
 * @param message
 * @param web3
 * @param txInfo
 * @param txProcMap
 * @returns
 */
//will become MPC
export const signMsg = async (message: string, web3: Web3<RegisteredSubscription>, txInfo: string[]) => {
  try {
    // const sig = web3.eth.accounts.sign(message, "0xb0bffa4504c56ae708e1fed516aa433f8926fd1dfd667ebd33667611ab02ac0f")
    // const { signature, messageHash, r, s, v } = sig
    // console.log("MPC Address:", web3.eth.accounts.recover(message, signature))
    // console.log("MPC Address:", web3.eth.accounts.recover(message, v, r, s))
    // const myMsgHashAndPrefix = web3.eth.accounts.hashMessage(message)
    // const netSigningMsg = message
    // return signature
    const myMsgHashAndPrefix = web3.eth.accounts.hashMessage(message)
    const netSigningMsg = myMsgHashAndPrefix.substr(2)
    const i = 0
    try {
      const { signature, r, s, v } = (await signClient(i, netSigningMsg, txInfo)) as any
      console.log("SIGNATURE =================> ", { netSigningMsg, signature, r, s, v })
      try {
        console.log("MPC Address:", recoverAddress(myMsgHashAndPrefix, signature))
      } catch (err) {
        console.log("err: ", err)
      }
      return Promise.resolve(signature)
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
 * @param amt
 * @param targetAddressHash
 * @param txid
 * @param toContractAddress
 * @param toChainIdHash
 * @param vault
 * @returns string
 */
export const concatMsg = (amt: string, targetAddressHash: string, txid: string, toContractAddress: string, toChainIdHash: string, vault: boolean) => {
  return amt + targetAddressHash + txid + toContractAddress + toChainIdHash + vault
}

/**
 * @param amt
 * @param web3
 * @param vault
 * @param txInfo
 * @param txProcMap
 */
export const hashAndSignTx = async (amt: string, web3: Web3<RegisteredSubscription>, vault: boolean, txInfo: string[]) => {
  try {
    const toTargetAddrHash = txInfo[5]
    const txid = txInfo[0]
    const toChainIdHash = txInfo[2]
    const toContractAddress = txInfo[4]
    const nonce = txInfo[7]
    const message = concatMsg(amt, toTargetAddrHash, txid, toContractAddress, toChainIdHash, vault)
    // console.log("Message:", message)
    const hash = web3.utils.soliditySha3(message)
    const sig = await signMsg(hash, web3, txInfo)
    return Promise.resolve(sig)
  } catch (err) {
    if (err.toString().includes("invalid point")) {
      hashAndSignTx(amt, web3, vault, txInfo)
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
