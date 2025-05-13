import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { settings } from '../config';

const exec = promisify(execFile);

export enum Protocol {
  GG18 = 'gg18',
  CGGMP20 = 'cggmp20',
  CGGMP21 = 'cggmp21'
}

export interface SignOptions {
  messageHash: string;
  keySharePath?: string;
}

export interface PresignOptions {
  sessionId: string;
  threshold: number;
  totalParties: number;
  keySharePath: string;
}

export interface ProtocolConfig {
  protocol: Protocol;
  partyId: number;
  threshold: number;
  totalParties: number;
  keySharePath: string;
  binPath: string;
}

/**
 * Base class for MPC protocol implementations
 */
export abstract class MPCProtocol {
  protected config: ProtocolConfig;

  constructor(config: ProtocolConfig) {
    this.config = config;
  }

  /**
   * Sign a message using the protocol
   */
  abstract sign(options: SignOptions): Promise<{
    r: string;
    s: string;
    v: string;
    signature: string;
  }>;

  /**
   * Get the binary path for the specified command
   */
  protected getBinPath(command: string): string {
    return path.join(this.config.binPath, command);
  }
}

/**
 * CGGMP20 Protocol implementation (current protocol)
 */
export class CGGMP20Protocol extends MPCProtocol {
  private signClientName: string;
  private smManager: string;

  constructor(config: ProtocolConfig, signClientName: string, smManager: string) {
    super(config);
    this.signClientName = signClientName;
    this.smManager = smManager;
  }

  /**
   * Sign a message using CGGMP20 protocol
   */
  async sign(options: SignOptions): Promise<{ r: string; s: string; v: string; signature: string }> {
    const { messageHash } = options;
    const keyStore = options.keySharePath || settings.KeyStore;

    try {
      // Execute the signing client
      const cmd = this.getBinPath(this.signClientName);
      const { stdout, stderr } = await exec(cmd, [
        this.smManager,
        keyStore,
        messageHash
      ], { cwd: path.join(this.config.binPath, '..') });

      if (stderr && stderr.length > 0) {
        throw new Error(`Signing error: ${stderr}`);
      }

      // Parse the signature output
      const sig = stdout.split('sig_json')[1].split(',');
      if (sig.length < 3) {
        throw new Error('Invalid signature format');
      }

      const r = sig[0].replace(': ', '').replace(/["]/g, '').trim();
      const s = sig[1].replace(/["]/g, '').trim();
      const v = Number(sig[2].replace(/["]/g, '')) === 0 ? '1b' : '1c';
      
      let signature = '0x' + r + s + v;
      
      // Handle odd length signatures
      if (signature.length % 2 !== 0) {
        signature = '0x0' + signature.split('0x')[1];
      }

      return { r, s, v, signature };
    } catch (error) {
      console.error('CGGMP20 sign error:', error);
      throw error;
    }
  }
}

/**
 * CGGMP21 Protocol implementation with presigning support
 */
export class CGGMP21Protocol extends MPCProtocol {
  private presignStore: PresignStore;
  
  constructor(config: ProtocolConfig) {
    super(config);
    this.presignStore = new PresignStore(config.keySharePath);
  }

  /**
   * Sign a message using CGGMP21 protocol with presigning
   */
  async sign(options: SignOptions): Promise<{ r: string; s: string; v: string; signature: string }> {
    const { messageHash } = options;
    const keySharePath = options.keySharePath || this.config.keySharePath;

    try {
      // Get or create presign data
      const presignData = await this.getOrCreatePresignData();
      
      // Get the presign data path
      const presignPath = path.join(keySharePath, `presign_${presignData.id}_${this.config.partyId}.json`);
      
      if (!fs.existsSync(presignPath)) {
        throw new Error(`Presign data not found at ${presignPath}`);
      }
      
      // Read the presign data
      const presignDataContent = fs.readFileSync(presignPath, 'utf8');
      
      // Execute the signing client
      const cmd = this.getBinPath('cggmp21_sign_client');
      const { stdout, stderr } = await exec(cmd, [
        this.config.partyId.toString(),
        messageHash
      ], { input: presignDataContent });

      if (stderr && stderr.length > 0) {
        throw new Error(`Signing error: ${stderr}`);
      }

      // Parse the signature output
      const sig = stdout.split('sig_json:')[1].split(',');
      if (sig.length < 3) {
        throw new Error('Invalid signature format');
      }

      const r = sig[0].replace(/["]/g, '').trim();
      const s = sig[1].replace(/["]/g, '').trim();
      const v = Number(sig[2].replace(/["]/g, '')) === 0 ? '1b' : '1c';
      
      let signature = '0x' + r + s + v;
      
      // Handle odd length signatures
      if (signature.length % 2 !== 0) {
        signature = '0x0' + signature.split('0x')[1];
      }

      // Mark the presign data as used to avoid reuse
      await this.presignStore.markPresignDataAsUsed(presignData.id);

      // Ensure we have more presign data for future use
      this.generateMorePresignDataIfNeeded();

      return { r, s, v, signature };
    } catch (error) {
      console.error('CGGMP21 sign error:', error);
      throw error;
    }
  }

  /**
   * Generate presign data for later use
   */
  async generatePresignData(): Promise<{ id: string, path: string }> {
    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
    
    try {
      // Get the key share path
      const keySharePath = path.join(this.config.keySharePath, `key_share_${this.config.partyId}.json`);
      
      if (!fs.existsSync(keySharePath)) {
        throw new Error(`Key share not found at ${keySharePath}`);
      }
      
      const keyShareContent = fs.readFileSync(keySharePath, 'utf8');
      
      // Execute the presign client
      const cmd = this.getBinPath('cggmp21_presign_client');
      const { stdout, stderr } = await exec(cmd, [
        this.config.partyId.toString(),
        this.config.threshold.toString(),
        this.config.totalParties.toString(),
        sessionId
      ], { input: keyShareContent, cwd: path.join(this.config.binPath, '..') });

      if (stderr && stderr.length > 0) {
        throw new Error(`Presign error: ${stderr}`);
      }

      // Save the presign data
      const presignPath = path.join(this.config.keySharePath, `presign_${sessionId}_${this.config.partyId}.json`);
      fs.writeFileSync(presignPath, stdout);
      
      // Add to presign store
      await this.presignStore.savePresignData({
        id: sessionId,
        path: presignPath,
        used: false,
        createdAt: new Date()
      });

      console.log(`Generated presign data at ${presignPath}`);
      
      return { id: sessionId, path: presignPath };
    } catch (error) {
      console.error('Error generating presign data:', error);
      throw error;
    }
  }

  /**
   * Get unused presign data or create a new one
   */
  async getOrCreatePresignData(): Promise<{ id: string, path: string }> {
    // Try to get unused presign data
    const presignData = await this.presignStore.getUnusedPresignData();
    
    if (presignData) {
      return { id: presignData.id, path: presignData.path };
    }
    
    // No unused presign data found, create a new one
    return this.generatePresignData();
  }

  /**
   * Generate more presign data if we're running low
   */
  async generateMorePresignDataIfNeeded(minCount: number = 5): Promise<void> {
    const unusedCount = await this.presignStore.getUnusedCount();
    
    if (unusedCount < minCount) {
      // Generate presign data in background
      this.generatePresignData().catch(err => {
        console.error('Error generating additional presign data:', err);
      });
    }
  }

  /**
   * Refresh key shares for added security
   */
  async refreshKeyShares(epoch: number): Promise<string> {
    try {
      // Get the current key share path
      const keySharePath = path.join(this.config.keySharePath, `key_share_${this.config.partyId}.json`);
      
      if (!fs.existsSync(keySharePath)) {
        throw new Error(`Key share not found at ${keySharePath}`);
      }
      
      const keyShareContent = fs.readFileSync(keySharePath, 'utf8');
      
      // Execute the refresh client
      const cmd = this.getBinPath('cggmp21_refresh_client');
      const { stdout, stderr } = await exec(cmd, [
        this.config.partyId.toString(),
        this.config.threshold.toString(),
        this.config.totalParties.toString(),
        epoch.toString()
      ], { input: keyShareContent, cwd: path.join(this.config.binPath, '..') });

      if (stderr && stderr.length > 0) {
        throw new Error(`Refresh error: ${stderr}`);
      }

      // Save the refreshed key share
      const newKeySharePath = path.join(this.config.keySharePath, `key_share_${this.config.partyId}_${epoch}.json`);
      fs.writeFileSync(newKeySharePath, stdout);
      
      // Update the main key share file
      fs.copyFileSync(newKeySharePath, keySharePath);
      
      // After key refresh, all presign data is invalid and should be marked as used
      await this.presignStore.markAllAsUsed();
      
      // Generate new presign data
      this.generateMorePresignDataIfNeeded(10);
      
      return newKeySharePath;
    } catch (error) {
      console.error('Error refreshing keys:', error);
      throw error;
    }
  }
}

/**
 * Interface for presign data
 */
export interface PresignData {
  id: string;
  path: string;
  used: boolean;
  createdAt: Date;
}

/**
 * Store for managing presign data
 */
export class PresignStore {
  private dbPath: string;
  private data: PresignData[] = [];
  
  constructor(keySharePath: string) {
    this.dbPath = path.join(keySharePath, 'presign_store.json');
    this.loadFromDisk();
  }
  
  /**
   * Load presign data from disk
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        this.data = data.map((item: any) => ({
          ...item,
          createdAt: new Date(item.createdAt)
        }));
      }
    } catch (error) {
      console.error('Error loading presign store:', error);
      this.data = [];
    }
  }
  
  /**
   * Save presign data to disk
   */
  private saveToDisk(): void {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data));
    } catch (error) {
      console.error('Error saving presign store:', error);
    }
  }
  
  /**
   * Save presign data
   */
  async savePresignData(presignData: PresignData): Promise<void> {
    this.data.push(presignData);
    this.saveToDisk();
  }
  
  /**
   * Get unused presign data
   */
  async getUnusedPresignData(): Promise<PresignData | null> {
    const unusedData = this.data.find(item => !item.used);
    return unusedData || null;
  }
  
  /**
   * Get the count of unused presign data
   */
  async getUnusedCount(): Promise<number> {
    return this.data.filter(item => !item.used).length;
  }
  
  /**
   * Mark presign data as used
   */
  async markPresignDataAsUsed(id: string): Promise<void> {
    const index = this.data.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data[index].used = true;
      this.saveToDisk();
    }
  }
  
  /**
   * Mark all presign data as used
   */
  async markAllAsUsed(): Promise<void> {
    this.data.forEach(item => {
      item.used = true;
    });
    this.saveToDisk();
  }
}

/**
 * Factory function to create the appropriate protocol handler
 */
export function createProtocol(protocolType: Protocol, config: {
  partyId: number;
  threshold: number;
  totalParties: number;
  keySharePath: string;
  binPath: string;
  signClientName?: string;
  smManager?: string;
}): MPCProtocol {
  switch (protocolType) {
    case Protocol.CGGMP21:
      return new CGGMP21Protocol({
        protocol: Protocol.CGGMP21,
        partyId: config.partyId,
        threshold: config.threshold,
        totalParties: config.totalParties,
        keySharePath: config.keySharePath,
        binPath: config.binPath
      });
    
    case Protocol.CGGMP20:
      if (!config.signClientName || !config.smManager) {
        throw new Error('CGGMP20 protocol requires signClientName and smManager');
      }
      
      return new CGGMP20Protocol(
        {
          protocol: Protocol.CGGMP20,
          partyId: config.partyId,
          threshold: config.threshold,
          totalParties: config.totalParties,
          keySharePath: config.keySharePath,
          binPath: config.binPath
        },
        config.signClientName,
        config.smManager
      );
    
    default:
      throw new Error(`Unsupported protocol: ${protocolType}`);
  }
}
