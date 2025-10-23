import {
  PublicKey,
  AddressLookupTableProgram,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { defaultStaticAccountsStruct } from "@lightprotocol/stateless.js";
import { SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS } from "./generated/programs";
import { ALLOWED_ADDRESS_TREE, CPI_SIGNER_PDA } from "./constants";
import { deriveEventAuthorityAddress, deriveSasAuthorityAddress } from "./pdas";

/**
 * Create instructions for an Address Lookup Table (ALT) optimized for compressed attestation operations.
 *
 * This creates a lookup table containing static Light Protocol system accounts and the hardcoded
 * address tree. Does NOT include state trees or output queues as those can change.
 *
 * @param payer                 Public key of the fee payer
 * @param authority             Public key of the lookup table authority
 * @param recentSlot            Recent finalized slot number (use `await connection.getSlot('finalized')`)
 * @param additionalAccounts    Optional array of additional account public keys to include
 *
 * @returns Object containing the create and extend instructions, plus the lookup table address
 *
 * @example
 * ```typescript
 * const recentSlot = await connection.getSlot('finalized');
 * const { instructions, address } = createCompressionLookupTable({
 *   payer: payer.publicKey,
 *   authority: authority.publicKey,
 *   recentSlot,
 *   additionalAccounts: [credentialPda, schemaPda],
 * });
 *
 * // Send instructions sequentially with finalized commitment
 * for (const instruction of instructions) {
 *   const tx = new Transaction().add(instruction);
 *   await sendAndConfirmTransaction(connection, tx, [payer, authority], {
 *     commitment: 'finalized'
 *   });
 * }
 * ```
 */
export async function createCompressionLookupTable({
  payer,
  authority,
  recentSlot,
  additionalAccounts,
}: {
  payer: PublicKey;
  authority: PublicKey;
  recentSlot: number;
  additionalAccounts?: PublicKey[];
}): Promise<{
  instructions: TransactionInstruction[];
  address: PublicKey;
}> {
  // Create the lookup table
  const [createInstruction, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority,
      payer,
      recentSlot,
    });

  // Get Light Protocol static accounts
  const staticAccounts = defaultStaticAccountsStruct();

  // Convert ALLOWED_ADDRESS_TREE from Address to PublicKey
  const allowedAddressTree = new PublicKey(ALLOWED_ADDRESS_TREE);

  // Convert program address from Address to PublicKey
  const programId = new PublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS);

  // Light Protocol CPI signer PDA
  const cpiSignerPda = new PublicKey(CPI_SIGNER_PDA);

  // Derive constant PDAs
  const eventAuthority = new PublicKey(await deriveEventAuthorityAddress());
  const sasAuthority = new PublicKey(await deriveSasAuthorityAddress());

  // Build the list of static accounts to include in the lookup table
  const baseAccounts = [
    SystemProgram.programId,
    ComputeBudgetProgram.programId,
    programId,
    staticAccounts.registeredProgramPda,
    staticAccounts.accountCompressionAuthority,
    staticAccounts.accountCompressionProgram,
    allowedAddressTree,
    cpiSignerPda,
    eventAuthority,
    sasAuthority,
    authority,
  ];

  // Create extend instruction for base accounts
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer,
    authority,
    lookupTable: lookupTableAddress,
    addresses: baseAccounts,
  });

  const instructions: TransactionInstruction[] = [
    createInstruction,
    extendInstruction,
  ];

  // Add additional accounts in chunks of 25 if provided
  if (additionalAccounts && additionalAccounts.length > 0) {
    for (let i = 0; i < additionalAccounts.length; i += 25) {
      const chunk = additionalAccounts.slice(i, i + 25);
      const extendIx = AddressLookupTableProgram.extendLookupTable({
        payer,
        authority,
        lookupTable: lookupTableAddress,
        addresses: chunk,
      });
      instructions.push(extendIx);
    }
  }

  return {
    instructions,
    address: lookupTableAddress,
  };
}
