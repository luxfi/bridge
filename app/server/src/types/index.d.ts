// Type definitions for modules that ship without their own .d.ts.

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

// Logger types
declare module '../utils/logger' {
  export const logger: {
    info(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
  };
}
