import type { NextApiRequest, NextApiResponse } from 'next';
import { fireblocksApiRequest, getOrCreateAsset } from '../../../lib/fireblocks';
import prisma from '../../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { chain, token } = req.body;

  try {
    // Get or create the asset and vault account
    const asset = await getOrCreateAsset(chain, token);

    const { assetId, vaultAccountId, assetType } = asset;

    let depositAddressData: any;

    if (assetType === 'UTXO') {
      // Create a vault wallet for the asset if not already created
      try {
        await fireblocksApiRequest('POST', `/v1/vault/accounts/${vaultAccountId}/${assetId}`);
      } catch (error: any) {
        // Ignore error if wallet already exists
        if (error.response && error.response.status === 409) {
          console.log(`Vault wallet for ${assetId} already exists.`);
        } else {
          throw error;
        }
      }

      // Create deposit address
      depositAddressData = await fireblocksApiRequest(
        'POST',
        `/v1/vault/accounts/${vaultAccountId}/${assetId}/addresses`,
        {
          description: 'One-time deposit address',
        }
      );
    } else if (assetType === 'AccountTag') {
      // For assets with tag/memo support
      // Generate a unique tag/memo for this deposit
      const uniqueTag = generateUniqueTag();

      // Get the existing address for the asset
      const addresses = await fireblocksApiRequest(
        'GET',
        `/v1/vault/accounts/${vaultAccountId}/${assetId}/addresses`
      );

      if (addresses && addresses.length > 0) {
        depositAddressData = {
          address: addresses[0].address,
          tag: uniqueTag,
        };
      } else {
        throw new Error(`No address found for asset ${assetId}`);
      }
    } else if (assetType === 'Account') {
      // For account-based assets without tag/memo support
      // Use the existing address
      const addresses = await fireblocksApiRequest(
        'GET',
        `/v1/vault/accounts/${vaultAccountId}/${assetId}/addresses`
      );

      if (addresses && addresses.length > 0) {
        depositAddressData = {
          address: addresses[0].address,
        };
      } else {
        throw new Error(`No address found for asset ${assetId}`);
      }
    } else {
      throw new Error(`Unsupported asset type: ${assetType}`);
    }

    // Store in your database
    const depositAddress = await prisma.depositAddress.create({
      data: {
        type: 'bridge',
        address: depositAddressData.address,
        tag: depositAddressData.tag || null,
        assetId: assetId,
        chain: chain,
        token: token,
        accountId: vaultAccountId,
        createdAt: new Date(),
      },
    });

    res.status(200).json({ success: true, depositAddress: depositAddressData });
  } catch (error) {
    console.error('Error generating deposit address:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// Helper function to generate a unique tag/memo
function generateUniqueTag(): string {
  return Date.now().toString();
}
