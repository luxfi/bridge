// Type definitions for missing modules

declare module 'web3' {
  export default class Web3 {
    static utils: {
      keccak256(data: string): string;
      recover(message: string, signature: string): string;
      toWei(value: string, unit: string): string;
      fromWei(value: string, unit: string): string;
    };
    constructor(provider?: any);
  }
}

declare module 'consul' {
  interface ConsulOptions {
    host?: string;
    port?: string;
    promisify?: boolean;
  }

  interface ServiceRegistration {
    ID: string;
    Name: string;
    Tags?: string[];
    Port?: number;
    Address?: string;
    Check?: {
      HTTP?: string;
      Interval?: string;
      Timeout?: string;
    };
    Meta?: Record<string, string>;
  }

  interface KVPair {
    Key: string;
    Value: string | Buffer;
  }

  export default class Consul {
    constructor(options?: ConsulOptions);
    
    agent: {
      service: {
        register(service: ServiceRegistration): Promise<void>;
        deregister(id: string): Promise<void>;
      };
    };
    
    kv: {
      get(key: string): Promise<{ Value: string } | null>;
      set(options: KVPair): Promise<void>;
    };
    
    health: {
      service(service: string, tag?: string, passing?: boolean, options?: any): Promise<any[]>;
    };
  }
}

declare module 'nats' {
  export interface NatsConnection {
    publish(subject: string, data: Uint8Array | string): void;
    subscribe(subject: string, cb: (msg: Msg) => void): Subscription;
    request(subject: string, data: Uint8Array | string, options?: RequestOptions): Promise<Msg>;
    close(): Promise<void>;
    jetstream(): JetStreamManager;
  }

  export interface Msg {
    subject: string;
    data: Uint8Array;
    respond(data: Uint8Array | string): void;
  }

  export interface Subscription {
    unsubscribe(): void;
  }

  export interface RequestOptions {
    timeout?: number;
  }

  export interface JetStreamManager {
    publish(subject: string, data: Uint8Array | string): Promise<PubAck>;
  }

  export interface PubAck {
    seq: number;
    duplicate: boolean;
  }

  export function connect(options?: ConnectionOptions): Promise<NatsConnection>;

  export interface ConnectionOptions {
    servers?: string | string[];
    name?: string;
  }
}

// Logger types
declare module '../utils/logger' {
  export const logger: {
    info(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
  };
}