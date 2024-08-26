/*
 * Teleport Bridge
 * Copyright (c) Artrepreneur1
 * Use of this source code is governed by an MIT
 * license that can be found in the LICENSE file.
 * This is an implementation of a privacy bridging node.
 * Currently, utilizes ECDSA Signatures to validate burning or vaulting of assets.
 * Signatures allow minting to occur cross chain.
 */
import cors from "cors"
import express from "express"
import Web3 from "web3"
import { Interface } from "ethers"
import { promisify } from "util"
import { exec as childExec } from "child_process"
import { settings } from "./config"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { hashAndSignTx, signClient, sleep } from "./utils"

const exec = promisify(childExec)
/* Settings Mapping */
const settingsMap = new Map()

for (const [key, value] of Object.entries(settings)) {
  //Stucture: settingsMap.set("someLuxCoin", {chain1:"", ..., chainN: ""})
  settingsMap.set(key, value)
}

/* RPC list */
const rpcList = settings.RPC
/* Networks (ie. chains) */
const networkName = settings.NetNames
/* Signature Re-signing flag */
const newSigAllowed = settings.NewSigAllowed
/* Signing MSG */
const msg = settings.Msg //signing msg used in front running prevention
/* Dupelist - a graylist for slowing flood attack */
let dupeStart = 0
const dupeListLimit = Number(settings.DupeListLimit)
let dupeList = new Map()
/* Bridge contracts for Teleport Bridge */
const list = settings.Teleporter

function getWeb3ForId(toNetId: number) {
  return new Web3(new Web3.providers.HttpProvider(rpcList[toNetId]))
}

/* Given network id returns the appropriate contract to talk to as array of values */
const getNetworkAddresses = (toNetId: number, tokenName: string) => {
  const web3 = getWeb3ForId(toNetId)
  const chainName: string = networkName[toNetId]
  return [settingsMap.get(tokenName.toString())[chainName], web3, list[chainName]]
}

const Exp = /((^[0-9]+[a-z]+)|(^[a-z]+[0-9]+))+[0-9a-z]+$/i

const app = express()
app.use(cors())

const port = process.env.PORT || 6000 //6000
const server = app.listen(Number(port), "0.0.0.0", function () {
  const host = server.address()
  console.log(`>> Teleporter_${process.env.node_number} Running At: ${port}`)
})

app.get("/", async (req: express.Request, res: express.Response) => {
  res.send(`>>> node_${process.env.node_number} is running at: ${port}`)
})

/*
 * Given parameters associated with the token burn, we validate and produce a signature entitling user to payout.
 * Parameters specific to where funds are being moved / minted to, are hashed, such that only the user has knowledge of
 * mint destination. Effectively, the transaction is teleported stealthily.
 */
app.get(
  "/api/v1/getsig/txid/:txid/fromNetId/:fromNetId/toNetIdHash/:toNetIdHash/tokenName/:tokenName/tokenAddrHash/:tokenAddrHash/msgSig/:msgSig/toTargetAddrHash/:toTargetAddrHash/nonce/:nonce",
  async (req: express.Request, res: express.Response) => {
    // Checking inputs
    const stealthMode = true // Stealth overrride by default, for now.
    let sig: string = ""
    let evmTxHash: string = ""
    let output: any = null

    const txid = req.params.txid.trim()
    if (!(txid.length > 0) && !txid.match(Exp)) {
      output = "NullTransactionError: bad transaction hash"
      return res.send(output)
    }

    // Dupelist reset if time has elapsed.
    const dupeStop = new Date() //time now
    if ((Number(dupeStop) - dupeStart) / 1000 >= 2400) {
      dupeList = new Map() //Clear dupeList
      dupeStart = new Date().getTime()
    }

    // Limit on checks here, else you go into graylist.
    if (dupeList.get(txid.toString()) == undefined) {
      //First time
      dupeList.set(txid.toString(), 0) // init
    } else {
      if (dupeList.get(txid.toString()) >= dupeListLimit) {
        // temp blacklist - pm2 cron will reset graylist after 12hrs
        console.log("Dupe transaction request limit hit")
        output = "DupeTransactionError: Too many transaction requests. Try back later."
        res.send(output)
        return
      }
      dupeList.set(txid.toString(), dupeList.get(txid.toString()) + 1)
    }

    const fromNetId = req.params.fromNetId.trim()
    console.log("fromNetId:", fromNetId)
    if (!fromNetId) {
      output = "NullFromNetIDError: No from netId sent."
      res.send(output)
      return
    }

    const toNetIdHash = req.params.toNetIdHash.trim()
    if (!toNetIdHash) {
      output = "NullToNetIDHashError: No to netId sent."
      res.send(output)
      return
    }

    const tokenName = req.params.tokenName.trim()
    if (!tokenName) {
      output = "NullTokenNameError: No token name sent."
      res.send(output)
      return
    }

    const tokenAddrHash = req.params.tokenAddrHash.trim()
    console.log("TokenAddrHash:", tokenAddrHash)
    if (!tokenAddrHash) {
      output = "NullTokenAddressHashError: No token address hash sent."
      res.send(output)
      return
    }

    let toTargetAddrHash = req.params.toTargetAddrHash.trim()
    if (!toTargetAddrHash) {
      output = "NullToTargetAddrHashError: No target address hash sent."
      res.send(output)
      return
    }

    const msgSig = req.params.msgSig.trim()
    if (!msgSig) {
      output = "NullMessageSignatureError: Challenge message signature not sent."
      res.send(output)
      return
    }

    const nonce = req.params.nonce.trim()
    if (!nonce) {
      output = "NullNonceError: No nonce sent."
      res.send(output)
      return
    }

    const fromNetArr = getNetworkAddresses(Number(fromNetId), tokenName)
    // console.log("fromNetArr:", fromNetArr)
    evmTxHash = Web3.utils.soliditySha3(txid)
    const txidNonce = stealthMode ? evmTxHash + nonce : txid + nonce
    const txStub = stealthMode ? evmTxHash : txid
    const txInfo = [txStub, fromNetId, toNetIdHash, tokenName, tokenAddrHash, toTargetAddrHash, msgSig, nonce]
    // console.log("txidNonce:", txidNonce)
    // console.log("txProcMapX:", txProcMap.get(txidNonce.toString()), "TX MAP:", txProcMap)

    if (fromNetArr.length !== 3) {
      console.log("FromNetArrLengthError:", fromNetArr.length)
      output = "Unknown error occurred."
      res.send(output)
      return
    }
    const fromTokenConAddr: string = fromNetArr[0]
    const frombridgeConAddr: string = fromNetArr[2]
    const w3From: Web3<RegisteredSubscription> = fromNetArr[1]
    const cnt = 0

    const transaction = await getEVMTx(txid, w3From)
    if (!transaction) {
      output = { error: "NullTransactionError: bad transaction hash, no transaction on chain" }
      res.send(output)
      return
    } else {
      console.log("Transaction:", transaction)
      const { contractTo: contract, from, addressTo: fromTokenContract, value: amt, log: eventName } = transaction
      let vault = false
      if (!eventName) {
        output = "NotVaultedOrBurnedError: No tokens were vaulted or burned."
        res.send(output)
        return
      } else {
        console.log("Event:", eventName)
        if (eventName.toString() === "BridgeBurned") {
          vault = false
        } else if (eventName.toString() === "VaultDeposit") {
          vault = true
        }
      }
      // To prove user signed we recover signer for (msg, sig) using testSig which rtrns address which must == toTargetAddr or return error
      let signerAddress = ""
      try {
        signerAddress = w3From.eth.accounts.recover(msg, msgSig) //best  on server
      } catch (err) {
        console.log("cannt recover signer from msgSig")
        return res.status(400).json("cannt recover signer from msgSig")
      }
      console.log("signerAddress:", signerAddress.toString().toLowerCase(), "From Address:", from.toString().toLowerCase())
      // Bad signer (test transaction signer must be same as burn transaction signer) => exit, front run attempt
      let signerOk = false
      if (signerAddress.toString().toLowerCase() != from.toString().toLowerCase()) {
        console.log("*** Possible front run attempt, message signer not transaction sender ***")
        output = "NullToNetIDHashError: No to netId sent."
        res.send(output)
        return
      } else {
        signerOk = true
      }

      // If signerOk we use the toTargetAddrHash provided, else we hash the from address.
      toTargetAddrHash = signerOk ? toTargetAddrHash : Web3.utils.keccak256(from)
      // console.log("token contract:", fromTokenContract.toLowerCase(), "fromTokenConAddr", fromTokenConAddr.toLowerCase(), "contract", contract.toLowerCase(), "frombridgeConAddr", frombridgeConAddr.toLowerCase())
      // Token was burned.
      if (fromTokenContract.toLowerCase() === fromTokenConAddr.toLowerCase() && contract.toLowerCase() === frombridgeConAddr.toLowerCase()) {
        // console.log("fromTokenConAddr", fromTokenConAddr, "tokenAddrHash", tokenAddrHash)
        //Produce signature for minting approval.
        try {
          sig = (await hashAndSignTx(w3From.utils.toWei(amt.toString(), "ether"), w3From, vault, txInfo)) as string
          //NOTE: For private transactions, store only the sig.
          output = { fromTokenContractAddress: fromTokenContract, contract: contract, from: toTargetAddrHash, tokenAmt: amt, signature: sig, hashedTxId: txid, tokenAddrHash: tokenAddrHash, vault: vault }
          return res.send(output)
        } catch (err) {
          if (err === "AlreadyMintedError") {
            console.log(err)
            output = { error: err + " It appears these coins were already bridged." }
          } else if (err === "GasTooLowError") {
            console.log(err)
            output = { error: err + " Try setting higher gas prices. Do you have enough tokens to pay for fees?" }
          } else {
            console.log(err)
            output = { error: err }
          }
          res.json(output)
          return
        }
      } else {
        output = { error: "ContractMisMatchError: bad token or bridge contract address." }
        res.json(output)
        return
      }
    }
  }
)

const getEVMTx = async (txh: string, w3From: Web3<RegisteredSubscription>) => {
  // console.log("In getEVMTx", "txid:", txh)
  try {
    const transaction = await w3From.eth.getTransaction(txh)
    const transactionReceipt = await w3From.eth.getTransactionReceipt(txh)
    if (transaction != null && transactionReceipt != null && transaction != undefined && transactionReceipt != undefined) {
      // console.log("Transaction:", transaction, "Transaction Receipt:", transactionReceipt)
      const tx = { ...transaction, ...transactionReceipt }
      if (transactionReceipt.logs.length === 0) {
        throw new Error("getEVMTXError: there was a problem with the transaction receipt.")
      }
      const addrTo = transactionReceipt.logs.length > 0 ? transactionReceipt.logs[0].address : transactionReceipt.to
      let tokenAmt = parseInt(transaction.input.slice(74, 138), 16) / 10 ** 18
      tokenAmt -= tokenAmt * 0.008
      const contractTo = transaction.to
      const from = transaction.from
      let amount: number = 0
      const abi = ["event BridgeBurned(address caller, uint256 amt)", "event VaultDeposit(address depositor, uint256 amt)"]
      const iface = new Interface(abi)
      const eventLog = tx.logs
      let logName: string = ""
      // console.log("Log Length:", eventLog.length)
      for (const _event of eventLog) {
        try {
          //@ts-expect-error "_event type not matching"
          const log = iface.parseLog(_event)
          // console.log("log", log.name)
          logName = log.name
        } catch (error) {
          console.log("EventNotFoundError in log number:", _event)
        }
      }

      amount = transactionReceipt.logs.length > 0 && transactionReceipt.logs[0].data == "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ? 0 : Number(transactionReceipt.logs[0].data)
      amount = Number(Web3.utils.fromWei(amount.toLocaleString("fullwide", { useGrouping: false }).toString(), "ether"))

      const transactionObj = {
        contractTo,
        addressTo: addrTo,
        from,
        tokenAmount: tokenAmt,
        log: logName,
        value: amount
      }
      return transactionObj
    }
  } catch (err) {
    const error2 = "TransactionRetrievalError: Failed to retrieve transaction. Check transaction hash is correct."
    console.log("Error:", error2)
    return null
  }
}
