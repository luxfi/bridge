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
import { settings, swapMappings } from "./config"
import { RegisteredSubscription } from "web3/lib/commonjs/eth.exports"
import { hashAndSignTx, signClient, sleep } from "./utils"
import { PrismaClient } from "@prisma/client"

const exec = promisify(childExec)
const prisma = new PrismaClient()

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
/* DECIMAL LIST */
const DECIMALS = settings.DECIMALS
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

/**
 * get WEB3 object by given network id
 * @param networkId
 * @returns
 */
function getWeb3ForId(networkId: number) {
  try {
    const _web3 = new Web3(new Web3.providers.HttpProvider(rpcList[networkId]))
    return Promise.resolve(_web3)
  } catch (err) {
    return Promise.reject("error to build web3 object")
  }
}

/**
 * Given network id returns the appropriate contract to talk to as array of values
 * @param networkId
 * @param tokenName
 * @returns boject { fromTokenConAddr, w3From, frombridgeConAddr }
 */
const getNetworkInfo = async (networkId: number, tokenName: string) => {
  try {
    const web3 = await getWeb3ForId(networkId)
    const chainName: string = networkName[networkId]
    if (!chainName) throw "no chain"
    return {
      fromTokenConAddr: settingsMap.get(tokenName.toString())[chainName],
      w3From: web3,
      frombridgeConAddr: list[chainName]
    }
  } catch (err) {
    return null
  }
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
app.get("/api/v1/getsig/txid/:txid/fromNetId/:fromNetId/toNetIdHash/:toNetIdHash/tokenName/:tokenName/tokenAddr/:tokenAddr/msgSig/:msgSig/toTargetAddrHash/:toTargetAddrHash/nonce/:nonce", async (req: express.Request, res: express.Response) => {
  // Checking inputs
  const stealthMode = true // Stealth overrride by default, for now.

  const txid = req.params.txid.trim()
  if (!(txid.length > 0) && !txid.match(Exp)) {
    const output = {
      status: false,
      msg: "NullTransactionError: bad transaction hash"
    }
    res.json(output)
    return
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
      const output = {
        status: false,
        msg: "DupeTransactionError: Too many transaction requests. Try back later."
      }
      res.json(output)
      return
    }
    dupeList.set(txid.toString(), dupeList.get(txid.toString()) + 1)
  }

  const fromNetId = req.params.fromNetId.trim()
  if (!fromNetId) {
    const output = {
      status: false,
      msg: "NullFromNetIDError: No from netId sent."
    }
    res.json(output)
    return
  }

  const toNetIdHash = req.params.toNetIdHash.trim()
  if (!toNetIdHash) {
    const output = {
      status: false,
      msg: "NullToNetIDHashError: No to netId sent."
    }
    res.json(output)
    return
  }

  const tokenName = req.params.tokenName.trim()
  if (!tokenName) {
    const output = {
      status: false,
      msg: "NullTokenNameError: No token name sent."
    }
    res.json(output)
    return
  }

  const tokenAddr = req.params.tokenAddr.trim()
  if (!tokenAddr) {
    const output = {
      status: false,
      msg: "NullTokenAddressHashError: No token address sent."
    }
    res.json(output)
    return
  }

  let toTargetAddrHash = req.params.toTargetAddrHash.trim()
  if (!toTargetAddrHash) {
    const output = {
      status: false,
      msg: "NullToTargetAddrHashError: No target address hash sent."
    }
    res.json(output)
    return
  }

  const msgSig = req.params.msgSig.trim()
  if (!msgSig) {
    const output = {
      status: false,
      msg: "NullMessageSignatureError: Challenge message signature not sent."
    }
    res.json(output)
    return
  }

  const nonce = req.params.nonce.trim()
  if (!nonce) {
    const output = {
      status: false,
      msg: "NullNonceError: No nonce sent."
    }
    res.json(output)
    return
  }
  // TODO: check swap available according to source tokenName and destination token address
  const _availableTokensByDesTokenAddress = swapMappings[tokenAddr]
  if (!_availableTokensByDesTokenAddress) {
    const output = {
      status: false,
      msg: "NullDestinationTokenError: No destination Token."
    }
    res.json(output)
    return
  }
  if (!_availableTokensByDesTokenAddress.includes(tokenName)) {
    const output = {
      status: false,
      msg: "NullDestinationTokenError: No Swap Permitted Token."
    }
    res.json(output)
    return
  }

  const tokenAddrHash = Web3.utils.keccak256(tokenAddr) // hash the destinationTokenAddress
  const evmTxHash = Web3.utils.soliditySha3(txid)

  // check replay attack
  const { status, data } = await checkStealthSignature(evmTxHash)
  if (status) {
    const output = {
      status: false,
      msg: "DuplicatedTxHashError: TxHash already exists."
    }
    res.json(output)
    return
  }

  const txidNonce = stealthMode ? evmTxHash + nonce : txid + nonce
  const txStub = stealthMode ? evmTxHash : txid
  const txInfo = [txStub, fromNetId, toNetIdHash, tokenName, tokenAddrHash, toTargetAddrHash, msgSig, nonce]
  // console.log("txidNonce:", txidNonce)
  // console.log("txProcMapX:", txProcMap.get(txidNonce.toString()), "TX MAP:", txProcMap)
  // get network settings
  const fromNetArr = await getNetworkInfo(Number(fromNetId), tokenName)

  if (!fromNetArr) {
    console.log("FromNetArrLengthError:")
    const output = {
      status: false,
      msg: "Invalid source network settings."
    }
    res.json(output)
    return
  }

  const { fromTokenConAddr, w3From, frombridgeConAddr } = fromNetArr
  // get transaction info according to chains
  const transaction = await getEVMTx(txid, w3From)
  if (!transaction) {
    const output = {
      status: false,
      msg: "NullTransactionError: bad transaction hash, no transaction on chain"
    }
    res.json(output)
    return
  } else {
    const { teleporter, from, token: fromTokenContract, value: amount, eventName } = transaction
    let vault = false
    if (!eventName) {
      const output = {
        status: false,
        msg: "NotVaultedOrBurnedError: No tokens were vaulted or burned."
      }
      res.json(output)
      return
    } else {
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
      const output = {
        status: false,
        msg: "can not recover signer from msgSig"
      }
      res.json(output)
      return
    }
    console.log("signerAddress:", signerAddress.toString().toLowerCase(), "From Address:", from.toString().toLowerCase())
    // Bad signer (test transaction signer must be same as burn transaction signer) => exit, front run attempt
    let signerOk = false
    if (signerAddress.toString().toLowerCase() != from.toString().toLowerCase()) {
      console.log("*** Possible front run attempt, message signer not transaction sender ***")
      const output = {
        status: false,
        msg: "NullToNetIDHashError: No to netId sent."
      }
      res.json(output)
      return
    } else {
      signerOk = true
    }

    // If signerOk we use the toTargetAddrHash provided, else we hash the from address.
    toTargetAddrHash = signerOk ? toTargetAddrHash : Web3.utils.keccak256(from)
    // console.log("token contract:", fromTokenContract.toLowerCase(), "fromTokenConAddr", fromTokenConAddr.toLowerCase(), "contract", contract.toLowerCase(), "frombridgeConAddr", frombridgeConAddr.toLowerCase())
    // Token was burned.
    const _decimals = DECIMALS[tokenName] ?? "18"
    if (fromTokenContract.toLowerCase() === fromTokenConAddr.toLowerCase() && teleporter.toLowerCase() === frombridgeConAddr.toLowerCase()) {
      // console.log("fromTokenConAddr", fromTokenConAddr, "tokenAddrHash", tokenAddrHash)
      //Produce signature for minting approval.
      try {
        const { signature, mpcSigner } = await hashAndSignTx(amount.toString(), w3From, vault, txInfo, _decimals)
        //NOTE: For private transactions, store only the sig.
        const output = {
          fromTokenContractAddress: fromTokenContract,
          contract: teleporter,
          from: toTargetAddrHash,
          tokenAmt: amount,
          signature: signature,
          mpcSigner: mpcSigner,
          hashedTxId: evmTxHash,
          tokenAddrHash: tokenAddrHash,
          vault: vault
        }
        await saveEvmTxHash({
          chainType: "evm",
          txId: txid,
          amount: amount.toString(),
          signature,
          hashedTxId: evmTxHash
        })
        res.status(200).json({
          status: true,
          data: output
        })
        return
      } catch (err) {
        let output: any
        if (err === "AlreadyMintedError") {
          console.log(err)
          output = { status: false, msg: err + " It appears these coins were already bridged." }
        } else if (err === "GasTooLowError") {
          console.log(err)
          output = { status: false, msg: err + " Try setting higher gas prices. Do you have enough tokens to pay for fees?" }
        } else {
          console.log(err)
          output = { status: false, msg: err }
        }
        res.json(output)
        return
      }
    } else {
      const output = {
        status: false,
        msg: "ContractMisMatchError: bad token or bridge contract address."
      }
      res.json(output)
      return
    }
  }
})

/**
 * check relay attack
 * @param evmTxHash
 * @returns object { status, data }
 */
const checkStealthSignature = async (evmTxHash: string) => {
  console.log("Searching for txid:", evmTxHash)
  try {
    const data = await prisma.teleporter.findUnique({
      where: { hashedTxId: evmTxHash }
    })
    console.log("Find Stealth Hash: ", data)
    if (data) {
      return Promise.resolve({ status: true, data: data })
    } else {
      // not a replay
      return Promise.resolve({ status: false, data })
    }
  } catch (err) {
    return Promise.resolve({ status: false, data: null })
  }
}

/**
 * save Tx info to db
 * @param data
 */
const saveEvmTxHash = async (data: { chainType: string; txId: string; amount: string; signature: string; hashedTxId: string }) => {
  try {
    const _tx = await prisma.teleporter.findUnique({
      where: { hashedTxId: data.hashedTxId }
    })
    if (_tx) {
      console.log("Already Existed Tx")
    } else {
      await prisma.teleporter.create({ data })
    }
  } catch (err) {
    console.log(err)
    console.log("Failed to save tx to db")
  }
}

/**
 * get EVM transaction
 * @param txHash
 * @param w3From
 * @returns
 */
const getEVMTx = async (txHash: string, w3From: Web3<RegisteredSubscription>) => {
  try {
    const transaction = await w3From.eth.getTransaction(txHash)
    const transactionReceipt = await w3From.eth.getTransactionReceipt(txHash)
    if (transaction != null && transactionReceipt != null && transaction != undefined && transactionReceipt != undefined) {
      // console.log("Transaction:", transaction, "Transaction Receipt:", transactionReceipt)
      const tx = { ...transaction, ...transactionReceipt }
      if (transactionReceipt.logs.length === 0) {
        throw new Error("getEVMTXError: there was a problem with the transaction receipt.")
      }
      // console.log({ transaction })
      // const addrTo = transactionReceipt.logs.length > 0 ? transactionReceipt.logs[0].address : transactionReceipt.to
      const teleporter = String(transactionReceipt?.to)

      const _addressOfLog = String(transactionReceipt?.logs[0]?.address)
      const _addressToken = _addressOfLog.toLowerCase() === teleporter.toLowerCase() ? "0x0000000000000000000000000000000000000000" : _addressOfLog

      console.log("fromTokenAddress: =======>", _addressToken)
      // console.log({ addrTo, log0: transactionReceipt.logs[0] })
      // let tokenAmt = parseInt(transaction.input.slice(74, 138), 16)
      // console.log(tokenAmt)
      // tokenAmt -= tokenAmt * 0.008
      const from = transaction.from
      const abi = ["event BridgeBurned(address caller, uint256 amt)", "event VaultDeposit(address depositor, uint256 amt)"]
      const iface = new Interface(abi)
      const eventLog = tx.logs
      let _eventName: string = ""
      // console.log("Log Length:", eventLog.length)
      for (const _event of eventLog) {
        try {
          //@ts-expect-error "_event type not matching"
          const log = iface.parseLog(_event)
          _eventName = log.name
        } catch (error) {
          // console.log(`EventNotFoundError in log number:`, _event)
        }
      }

      // amount = transactionReceipt.logs.length > 0 && transactionReceipt.logs[0].data == "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" ? 0 : Number(transactionReceipt.logs[0].data)
      // amount = Number(Web3.utils.fromWei(amount.toLocaleString("fullwide", { useGrouping: false }).toString(), "ether"))
      const _tokenAmount = transactionReceipt.logs.length === 1 ? String(transactionReceipt.logs[0].data).substring(66) : String(transactionReceipt.logs[1].data).substring(66)
      // const amount = transactionReceipt.logs.length === 1 ? Number('0x' + String(transactionReceipt.logs[0]).substring(66)) : Number('0x' + String(transactionReceipt.logs[1]).substring(66))
      const _amount = Number("0x" + _tokenAmount)
      const transactionObj = {
        teleporter, // source teleporter address
        token: _addressToken,
        from,
        // tokenAmount: tokenAmt,
        eventName: _eventName,
        value: _amount
      }
      return transactionObj
    }
  } catch (err) {
    const error2 = "TransactionRetrievalError: Failed to retrieve transaction. Check transaction hash is correct."
    console.log("Error:", error2)
    return null
  }
}
