"use client"
import { useState, useEffect } from 'react'
import { Client as XrplClient, Wallet as XrplWallet } from 'xrpl'
import { XummSdk, PayloadCreate } from 'xumm'
import TransportWebHID from '@ledgerhq/hw-transport-webhid'
import AppXrp from '@ledgerhq/hw-app-xrp'

export type XrpAccount = { address: string }

export function useXrplWallet() {
  const [client, setClient] = useState<XrplClient>()
  const [sdk, setSdk] = useState<XummSdk>()
  const [account, setAccount] = useState<XrpAccount>()
  const [connector, setConnector] = useState<'xumm' | 'ledger'>('xumm')

  // initialize XRPL client and XUMM SDK
  useEffect(() => {
    const c = new XrplClient('wss://s1.ripple.com')
    c.connect().then(() => setClient(c))
    if (process.env.NEXT_PUBLIC_XUMM_API_KEY && process.env.NEXT_PUBLIC_XUMM_API_SECRET) {
      setSdk(new XummSdk(
        process.env.NEXT_PUBLIC_XUMM_API_KEY,
        process.env.NEXT_PUBLIC_XUMM_API_SECRET
      ))
    }
  }, [])

  // connect via XUMM
  const connectXumm = async () => {
    if (!sdk) throw new Error('XUMM SDK not initialized')
    const { uuid } = await sdk.payload.create({
      TransactionType: 'SignIn'
    } as PayloadCreate)
    sdk.ws.subscribe(`payload.${uuid}`).then(sub => {
      sub.on('success', (data: any) => {
        setAccount({ address: data.account })
        setConnector('xumm')
      })
    })
    window.open(sdk.payload.get.xrplNextUrl(uuid), '_blank')
  }

  // connect via Ledger hardware
  const connectLedger = async () => {
    const transport = await TransportWebHID.create()
    const app = new AppXrp(transport)
    const resp = await app.getAddress()
    setAccount({ address: resp.address })
    setConnector('ledger')
  }

  // send payment and return txid
  const sendPayment = async (amountDrops: string, destination: string) => {
    if (!client || !account) throw new Error('XRPL wallet not connected')
    if (connector === 'xumm') {
      const tx = {
        TransactionType: 'Payment',
        Account: account.address,
        Amount: amountDrops,
        Destination: destination
      }
      const { uuid } = await sdk!.payload.create({ txjson: tx } as PayloadCreate)
      return new Promise<string>(resolve => {
        sdk!.ws.subscribe(`payload.${uuid}`).then(sub => {
          sub.on('success', (data: any) => resolve(data.response.txid))
        })
      })
    } else {
      const transport = await TransportWebHID.create()
      const app = new AppXrp(transport)
      const prepared = await client.autofill({
        TransactionType: 'Payment',
        Account: account.address,
        Amount: amountDrops,
        Destination: destination
      })
      const signed = await app.sign(prepared)
      const result = await client.submitAndWait(signed.signedTransaction)
      return result.result.hash
    }
  }

  const disconnect = () => setAccount(undefined)

  return {
    account,
    connector,
    connectXumm,
    connectLedger,
    sendPayment,
    disconnect
  }
}