import axios, { AxiosInstance } from 'axios';
import { Logger } from './logger';

// Types for Ringtail signatures
export interface RingtailSignature {
    c: string;          // Challenge (hex)
    z: string;          // Response (hex)
    delta: string;      // Hint (hex)
    public_key: string; // Public key (hex)
}

export interface RingtailSignRequest {
    session_id: string;
    message: string; // Hex encoded
    round: number;
    party_data?: Record<string, any>;
    commitments?: Record<number, string>; // Party ID -> hex commitment
}

export interface RingtailSignResponse {
    success: boolean;
    round: number;
    data?: Record<string, any>;
    signature?: RingtailSignature;
    error?: string;
}

export interface RingtailClientConfig {
    partyId: number;
    serviceUrl: string;
    timeout?: number;
}

/**
 * Client for interacting with the Ringtail signing service
 */
export class RingtailClient {
    private client: AxiosInstance;
    private logger: Logger;
    private partyId: number;
    private activeCommitments: Map<string, Record<number, string>> = new Map();

    constructor(config: RingtailClientConfig) {
        this.partyId = config.partyId;
        this.logger = new Logger('RingtailClient');
        
        this.client = axios.create({
            baseURL: config.serviceUrl,
            timeout: config.timeout || 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add request/response logging
        this.client.interceptors.request.use(
            (config) => {
                this.logger.debug(`Request: ${config.method?.toUpperCase()} ${config.url}`, {
                    data: config.data,
                });
                return config;
            },
            (error) => {
                this.logger.error('Request error:', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                this.logger.debug(`Response: ${response.status}`, {
                    data: response.data,
                });
                return response;
            },
            (error) => {
                this.logger.error('Response error:', error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Execute Round 1 of the Ringtail signing protocol (offline phase)
     */
    async signRound1(sessionId: string, message: string): Promise<string> {
        try {
            const request: RingtailSignRequest = {
                session_id: sessionId,
                message: message, // Should be hex encoded
                round: 1,
            };

            const response = await this.client.post<RingtailSignResponse>('/sign', request);

            if (!response.data.success) {
                throw new Error(response.data.error || 'Round 1 failed');
            }

            if (!response.data.data?.commitment) {
                throw new Error('No commitment in Round 1 response');
            }

            this.logger.info(`Round 1 completed for session ${sessionId}`, {
                partyId: this.partyId,
                commitment: response.data.data.commitment,
            });

            return response.data.data.commitment;
        } catch (error) {
            this.logger.error(`Round 1 failed for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Store commitments from other parties for a session
     */
    storeCommitments(sessionId: string, commitments: Record<number, string>): void {
        this.activeCommitments.set(sessionId, commitments);
        this.logger.debug(`Stored commitments for session ${sessionId}`, {
            partyCount: Object.keys(commitments).length,
        });
    }

    /**
     * Execute Round 2 of the Ringtail signing protocol (online phase)
     */
    async signRound2(sessionId: string, message: string): Promise<RingtailSignature> {
        try {
            const commitments = this.activeCommitments.get(sessionId);
            if (!commitments) {
                throw new Error(`No commitments found for session ${sessionId}`);
            }

            const request: RingtailSignRequest = {
                session_id: sessionId,
                message: message,
                round: 2,
                commitments: commitments,
            };

            const response = await this.client.post<RingtailSignResponse>('/sign', request);

            if (!response.data.success) {
                throw new Error(response.data.error || 'Round 2 failed');
            }

            if (!response.data.signature) {
                throw new Error('No signature in Round 2 response');
            }

            this.logger.info(`Round 2 completed for session ${sessionId}`, {
                partyId: this.partyId,
                signatureSize: JSON.stringify(response.data.signature).length,
            });

            // Clean up stored commitments
            this.activeCommitments.delete(sessionId);

            return response.data.signature;
        } catch (error) {
            this.logger.error(`Round 2 failed for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Complete signing flow (both rounds) with coordination
     */
    async sign(
        message: string,
        sessionId: string,
        coordinateFunc: (sessionId: string, commitment: string) => Promise<Record<number, string>>
    ): Promise<RingtailSignature> {
        try {
            // Round 1: Generate commitment
            const commitment = await this.signRound1(sessionId, message);

            // Coordinate with other parties to exchange commitments
            const allCommitments = await coordinateFunc(sessionId, commitment);
            this.storeCommitments(sessionId, allCommitments);

            // Round 2: Generate signature
            const signature = await this.signRound2(sessionId, message);

            return signature;
        } catch (error) {
            this.logger.error(`Signing failed for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Check service health
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get('/health');
            return response.data.status === 'healthy';
        } catch (error) {
            this.logger.error('Health check failed:', error);
            return false;
        }
    }

    /**
     * Get session status
     */
    async getSessionStatus(sessionId?: string): Promise<any> {
        try {
            const params = sessionId ? { session_id: sessionId } : {};
            const response = await this.client.get('/status', { params });
            return response.data;
        } catch (error) {
            this.logger.error('Failed to get session status:', error);
            throw error;
        }
    }
}

/**
 * Factory function to create Ringtail client from environment
 */
export function createRingtailClient(): RingtailClient {
    const partyId = parseInt(process.env.PARTY_ID || '0', 10);
    const serviceUrl = process.env.RINGTAIL_SERVICE_URL || 'http://localhost:8080';
    
    return new RingtailClient({
        partyId,
        serviceUrl,
    });
}

/**
 * Helper to convert Ringtail signature to hex string for storage
 */
export function ringtailSignatureToHex(sig: RingtailSignature): string {
    return JSON.stringify(sig);
}

/**
 * Helper to parse Ringtail signature from hex string
 */
export function hexToRingtailSignature(hex: string): RingtailSignature {
    return JSON.parse(hex);
}