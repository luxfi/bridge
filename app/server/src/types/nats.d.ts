// Temporary type declaration for NATS
declare module "nats" {
  export interface StringCodec {
    encode(str: string): Uint8Array
    decode(arr: Uint8Array): string
  }
  
  export function StringCodec(): StringCodec
  
  export interface NatsConnection {
    subscribe(subject: string): Subscription
    publish(subject: string, data?: Uint8Array): Promise<void>
    close(): Promise<void>
  }
  
  export interface Subscription {
    [Symbol.asyncIterator](): AsyncIterator<Msg>
  }
  
  export interface Msg {
    data: Uint8Array
    subject: string
    respond(data?: Uint8Array): Promise<void>
  }
  
  export function connect(opts?: any): Promise<NatsConnection>
}