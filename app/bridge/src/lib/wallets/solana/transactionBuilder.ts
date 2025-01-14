import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { type CryptoNetwork, type NetworkCurrency } from "@/Models/CryptoNetwork";

const transactionBuilder = async (layer: CryptoNetwork, currency: NetworkCurrency, walletPublicKey: PublicKey) => {
    if (!layer.currencies) return

    const connection = new Connection(
        `${layer.nodes[0]}`,
        "confirmed"
    );

    const asset = layer?.currencies?.find(a => currency.asset === a.asset)

    const sourceToken = new PublicKey(asset?.contract_address!);
    const recipientAddress = new PublicKey(layer.managed_accounts[0]!);

    const transactionInstructions: TransactionInstruction[] = [];
    const associatedTokenFrom = await getAssociatedTokenAddress(
        sourceToken,
        walletPublicKey
    );
    const fromAccount = await getAccount(connection, associatedTokenFrom);
    const associatedTokenTo = await getAssociatedTokenAddress(
        sourceToken,
        recipientAddress
    );

    if (!(await connection.getAccountInfo(associatedTokenTo))) {
        transactionInstructions.push(
            createAssociatedTokenAccountInstruction(
                walletPublicKey,
                associatedTokenTo,
                recipientAddress,
                sourceToken
            )
        );
    }
    transactionInstructions.push(
        createTransferInstruction(
            fromAccount.address,
            associatedTokenTo,
            walletPublicKey,
            20000 * Math.pow(10, Number(asset?.decimals))
        )
    );
    const result = await connection.getLatestBlockhash()

    const transaction = new Transaction({
        feePayer: walletPublicKey,
        blockhash: result.blockhash,
        lastValidBlockHeight: result.lastValidBlockHeight
    }).add(...transactionInstructions);

    return transaction
}

export default transactionBuilder