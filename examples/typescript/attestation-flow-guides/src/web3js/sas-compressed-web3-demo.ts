import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createRpc,
  Rpc as LightRpc,
  bn,
  batchQueue,
  defaultStaticAccountsStruct,
  lightSystemProgram,
  VERSION,
  featureFlags,
} from "@lightprotocol/stateless.js";
import {
  getCreateCredentialInstruction,
  getCreateSchemaInstruction,
  serializeAttestationData,
  deriveCredentialPda,
  deriveSchemaPda,
  deriveCompressedAttestationPda,
  deriveEventAuthorityAddress,
  ALLOWED_ADDRESS_TREE,
  SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  createCompressionLookupTable,
  CPI_SIGNER_PDA,
  fetchSchema,
  fetchCompressedAttestation,
  getCreateCompressedAttestationInstructionDataEncoder,
  getCloseCompressedAttestationInstructionDataEncoder,
} from "sas-lib";
import { createSolanaClient, createTransaction, createKeyPairSignerFromBytes } from "gill";

// Enable V2 for Light Protocol
featureFlags.version = VERSION.V2;

const CONFIG = {
  CLUSTER_OR_RPC: "http://127.0.0.1:8899",
  LIGHT_RPC: "http://127.0.0.1:8784",
  PROVER_URL: "http://127.0.0.1:3001",
  CREDENTIAL_NAME: "TEST-ORGANIZATION-WEB3",
  SCHEMA_NAME: "LARGE-DATA-WEB3",
  SCHEMA_LAYOUT: Buffer.from([12]), // Single string field
  SCHEMA_FIELDS: ["data"],
  SCHEMA_VERSION: 1,
  SCHEMA_DESCRIPTION: "Large data schema for testing with 650 bytes",
  ATTESTATION_DATA: {
    data: "A".repeat(549),
  },
  ATTESTATION_EXPIRY_DAYS: 365,
};

function addressToPublicKey(address: string): PublicKey {
  return new PublicKey(address);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


async function main() {
  console.log("Starting Compressed Attestation Service Demo (Web3.js Only)\n");

  const connection = new Connection(CONFIG.CLUSTER_OR_RPC, "confirmed");
  const gillClient = createSolanaClient({
    urlOrMoniker: CONFIG.CLUSTER_OR_RPC,
  });
  const lightRpc: LightRpc = createRpc(
    CONFIG.CLUSTER_OR_RPC,
    CONFIG.LIGHT_RPC,
    CONFIG.PROVER_URL,
    { commitment: "confirmed" },
  );

  // Step 1: Setup wallets
  console.log("1. Setting up wallets...");
  const payer = Keypair.generate();
  const authorizedSigner1 = Keypair.generate();
  const issuer = Keypair.generate();
  const testUser = Keypair.generate();

  // Create Gill signers from web3.js Keypairs
  const gillPayer = await createKeyPairSignerFromBytes(payer.secretKey);
  const gillIssuer = await createKeyPairSignerFromBytes(issuer.secretKey);

  // Request airdrops
  console.log("   Requesting airdrops...");
  const airdrop1 = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(airdrop1, "finalized");
  const airdrop2 = await connection.requestAirdrop(
    issuer.publicKey,
    LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(airdrop2, "confirmed");

  // Wait a bit more for funds to settle
  await sleep(1000);

  // Verify balances
  const payerBalance = await connection.getBalance(payer.publicKey);
  const issuerBalance = await connection.getBalance(issuer.publicKey);
  console.log(`   - Payer balance: ${payerBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`   - Issuer balance: ${issuerBalance / LAMPORTS_PER_SOL} SOL`);

  // Step 2: Create Address Lookup Table
  console.log("\n2. Creating Address Lookup Table...");
  const recentSlot = await connection.getSlot("finalized");
  console.log(`   - Using finalized slot: ${recentSlot}`);

  // const { instructions: lutInstructions, address: lutAddress } =
  //   await createCompressionLookupTable({
  //     payer: payer.publicKey,
  //     authority: payer.publicKey,
  //     recentSlot,
  //   });

  // console.log(`   - Created ${lutInstructions.length} LUT instructions`);
  // console.log(`   - LUT address will be: ${lutAddress.toBase58()}`);

  // // Send LUT creation instructions
  // for (let i = 0; i < lutInstructions.length; i++) {
  //   console.log(
  //     `   - Sending LUT instruction ${i + 1}/${lutInstructions.length}...`,
  //   );
  //   try {
  //     const tx = new Transaction().add(lutInstructions[i]);

  //     // Add recent blockhash
  //     const { blockhash } = await connection.getLatestBlockhash("finalized");
  //     tx.recentBlockhash = blockhash;
  //     tx.feePayer = payer.publicKey;

  //     const signature = await sendAndConfirmTransaction(
  //       connection,
  //       tx,
  //       [payer],
  //       {
  //         commitment: "finalized",
  //         skipPreflight: true,
  //       },
  //     );
  //     console.log(`     ✓ Signature: ${signature}`);
  //   } catch (error: any) {
  //     console.error(`     ✗ Failed:`, error.message);
  //     if (error.logs) {
  //       console.error(`     Logs:`, error.logs);
  //     }
  //     throw error;
  //   }
  // }
  // console.log(`   - Lookup Table Address: ${lutAddress.toBase58()}`);
  let lutAddress = new PublicKey(
    "G8NU2KCypjgSam28YE2iPYTJ77Lgmh4TKazPvVUvULN7",
  );
  const lutAccountResult = await connection.getAddressLookupTable(lutAddress);
  if (!lutAccountResult.value) {
    throw new Error("Failed to fetch lookup table");
  }
  const lookupTable = lutAccountResult.value;
  console.log(
    `   - Lookup table ready with ${lookupTable.state.addresses.length} addresses`,
  );

  // Step 3: Create Credential
  console.log("\n3. Creating Credential...");
  const [credentialPda] = await deriveCredentialPda({
    authority: issuer.publicKey.toBase58() as any,
    name: CONFIG.CREDENTIAL_NAME,
  });
  const credentialPubkey = addressToPublicKey(credentialPda);

  const createCredentialIx = getCreateCredentialInstruction({
    payer: gillPayer,
    credential: credentialPda,
    authority: gillIssuer,
    name: CONFIG.CREDENTIAL_NAME,
    signers: [authorizedSigner1.publicKey.toBase58() as any],
  });

  // Use Gill to send transaction
  const { value: latestBlockhash } = await gillClient.rpc.getLatestBlockhash().send();

  const credentialTx = createTransaction({
    version: "legacy",
    feePayer: gillPayer,
    instructions: [createCredentialIx],
    latestBlockhash,
    computeUnitLimit: 400_000,
    computeUnitPrice: 1,
  });

  const credentialSig = await gillClient.sendAndConfirmTransaction(credentialTx, {
    commitment: "confirmed",
  });
  console.log(`   - Credential created: ${credentialSig}`);
  console.log(`   - Credential PDA: ${credentialPda}`);

  // Step 4: Create Schema
  console.log("\n4. Creating Schema...");
  const [schemaPda] = await deriveSchemaPda({
    credential: credentialPda,
    name: CONFIG.SCHEMA_NAME,
    version: CONFIG.SCHEMA_VERSION,
  });
  const schemaPubkey = addressToPublicKey(schemaPda);

  const createSchemaIx = getCreateSchemaInstruction({
    authority: gillIssuer,
    payer: gillPayer,
    name: CONFIG.SCHEMA_NAME,
    credential: credentialPda,
    description: CONFIG.SCHEMA_DESCRIPTION,
    fieldNames: CONFIG.SCHEMA_FIELDS,
    schema: schemaPda,
    layout: CONFIG.SCHEMA_LAYOUT,
  });

  // Use Gill to send transaction
  const schemaTx = createTransaction({
    version: "legacy",
    feePayer: gillPayer,
    instructions: [createSchemaIx],
    latestBlockhash,
    computeUnitLimit: 400_000,
    computeUnitPrice: 1,
  });

  const schemaSig = await gillClient.sendAndConfirmTransaction(schemaTx, {
    commitment: "confirmed",
  });
  console.log(`   - Schema created: ${schemaSig}`);
  console.log(`   - Schema PDA: ${schemaPda}`);

  // Step 5: Create Compressed Attestation
  console.log("\n5. Creating Compressed Attestation...");

  // Derive compressed attestation address
  const compressedAddress = await deriveCompressedAttestationPda({
    credential: credentialPda,
    schema: schemaPda,
    nonce: testUser.publicKey.toBase58() as any,
  });
  const compressedAddressPubkey = addressToPublicKey(compressedAddress);
  const addressTreePubkey = addressToPublicKey(ALLOWED_ADDRESS_TREE);

  // Get validity proof for new address (non-inclusion proof)
  const createProofResult = await lightRpc.getValidityProofV0(
    [],
    [
      {
        tree: addressTreePubkey,
        queue: addressTreePubkey,
        address: bn(compressedAddressPubkey.toBytes()),
      },
    ],
  );

  const outputQueue = new PublicKey(batchQueue);

  // Fetch schema using Gill client for proper deserialization
  const schema = await fetchSchema(gillClient.rpc, schemaPda);

  const expiryTimestamp =
    Math.floor(Date.now() / 1000) +
    CONFIG.ATTESTATION_EXPIRY_DAYS * 24 * 60 * 60;

  // Create the compressed attestation instruction
  const proofBytes = createProofResult.compressedProof
    ? new Uint8Array([
        ...createProofResult.compressedProof.a,
        ...createProofResult.compressedProof.b,
        ...createProofResult.compressedProof.c,
      ])
    : new Uint8Array(128);

  // Serialize attestation data
  console.log(
    "   - Schema layout:",
    Buffer.from(schema.data.layout).toString("hex"),
  );
  console.log("   - Schema fields:", schema.data.fieldNames);
  console.log("   - Attestation data to serialize:", CONFIG.ATTESTATION_DATA);

  const attestationData = serializeAttestationData(
    schema.data,
    CONFIG.ATTESTATION_DATA,
  );
  console.log(
    `   - Serialized attestation data length: ${attestationData.length} bytes`,
  );
  console.log(
    `   - First 50 bytes: ${Buffer.from(attestationData).slice(0, 50).toString("hex")}`,
  );

  // Use Codama encoder for instruction data
  const instructionDataEncoder =
    getCreateCompressedAttestationInstructionDataEncoder();
  const instructionData = Buffer.from(
    instructionDataEncoder.encode({
      proof: proofBytes,
      nonce: testUser.publicKey.toBase58() as any,
      expiry: BigInt(expiryTimestamp),
      addressRootIndex: createProofResult.rootIndices[0],
      data: attestationData,
    }),
  );

  // Get Light Protocol static accounts
  const staticAccounts = defaultStaticAccountsStruct();

  // Manually build instruction with correct account metas
  const compressedWeb3Ix = new TransactionInstruction({
    programId: addressToPublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // 0: payer
      {
        pubkey: authorizedSigner1.publicKey,
        isSigner: true,
        isWritable: false,
      }, // 1: authority
      { pubkey: credentialPubkey, isSigner: false, isWritable: false }, // 2: credential
      { pubkey: schemaPubkey, isSigner: false, isWritable: false }, // 3: schema
      {
        pubkey: new PublicKey(lightSystemProgram),
        isSigner: false,
        isWritable: false,
      }, // 4: light_system_program
      {
        pubkey: addressToPublicKey(CPI_SIGNER_PDA),
        isSigner: false,
        isWritable: false,
      }, // 5: cpi_signer
      {
        pubkey: new PublicKey(staticAccounts.registeredProgramPda),
        isSigner: false,
        isWritable: false,
      }, // 6: registered_program_pda
      {
        pubkey: new PublicKey(staticAccounts.accountCompressionAuthority),
        isSigner: false,
        isWritable: false,
      }, // 7: account_compression_authority
      {
        pubkey: new PublicKey(staticAccounts.accountCompressionProgram),
        isSigner: false,
        isWritable: false,
      }, // 8: account_compression_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 9: system_program
      { pubkey: outputQueue, isSigner: false, isWritable: true }, // 10: output_queue
      { pubkey: addressTreePubkey, isSigner: false, isWritable: true }, // 11: address_merkle_tree
    ],
    data: instructionData,
  });

  console.log(
    `   - Built instruction manually with ${compressedWeb3Ix.keys.length} accounts`,
  );
  console.log(
    `   - Signers: payer=${payer.publicKey.toBase58().slice(0, 8)}..., authority=${authorizedSigner1.publicKey.toBase58().slice(0, 8)}...`,
  );

  // Create versioned transaction with lookup table
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      compressedWeb3Ix,
    ],
  }).compileToV0Message([lookupTable]);

  console.log(
    `   - Message has ${messageV0.staticAccountKeys.length} static account keys`,
  );
  console.log(
    `   - Message requires ${messageV0.header.numRequiredSignatures} signatures`,
  );

  const versionedTx = new VersionedTransaction(messageV0);

  // Sign with payer and authorizedSigner1
  // AuthorizedSigner1 is the authority that needs to sign the compressed attestation
  console.log(
    `   - Signing with payer: ${payer.publicKey.toBase58().slice(0, 8)}...`,
  );
  console.log(
    `   - Signing with authority: ${authorizedSigner1.publicKey.toBase58().slice(0, 8)}...`,
  );
  versionedTx.sign([payer, authorizedSigner1]);

  console.log("   - Sending versioned transaction with lookup table...");
  const compressedSig = await connection.sendTransaction(versionedTx, {
    skipPreflight: false,
  });

  await connection.confirmTransaction(
    {
      signature: compressedSig,
      blockhash,
      lastValidBlockHeight,
    },
    "confirmed",
  );

  console.log(`   - Compressed attestation created: ${compressedSig}`);
  console.log(
    `   - Compressed Address: 0x${Buffer.from(compressedAddressPubkey.toBytes()).toString("hex")}`,
  );

  // Step 6: Close Compressed Attestation
  console.log("\n6. Closing Compressed Attestation...");

  // Wait for indexer to sync
  await sleep(2000);

  // Fetch compressed account
  const attestationResult = await fetchCompressedAttestation(
    lightRpc,
    compressedAddress,
  );
  if (!attestationResult) {
    throw new Error("Compressed account not found");
  }

  const { compressedAccount, attestation: attestationForClose } =
    attestationResult;

  // Get validity proof for closing (inclusion proof)
  const closeProofResult = await lightRpc.getValidityProofV0(
    [
      {
        hash: compressedAccount.hash,
        tree: compressedAccount.treeInfo.tree,
        queue: compressedAccount.treeInfo.queue,
      },
    ],
    [], // no new addresses
  );

  // Use Codama encoder for close instruction data
  const closeProofBytes = closeProofResult.compressedProof
    ? new Uint8Array([
        ...closeProofResult.compressedProof.a,
        ...closeProofResult.compressedProof.b,
        ...closeProofResult.compressedProof.c,
      ])
    : null;

  const closeInstructionDataEncoder =
    getCloseCompressedAttestationInstructionDataEncoder();
  const closeInstructionData = Buffer.from(
    closeInstructionDataEncoder.encode({
      proof: closeProofBytes,
      rootIndex: closeProofResult.rootIndices[0],
      leafIndex: compressedAccount.leafIndex,
      address: compressedAddressPubkey.toBytes(),
      nonce: attestationForClose.nonce,
      schema: attestationForClose.schema,
      signer: attestationForClose.signer,
      expiry: BigInt(attestationForClose.expiry),
      data: attestationForClose.data,
    }),
  );

  // Get event authority PDA
  const eventAuthority = addressToPublicKey(
    await deriveEventAuthorityAddress(),
  );

  // Build close instruction
  const closeWeb3Ix = new TransactionInstruction({
    programId: addressToPublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // 0: payer
      {
        pubkey: authorizedSigner1.publicKey,
        isSigner: true,
        isWritable: false,
      }, // 1: authority
      { pubkey: credentialPubkey, isSigner: false, isWritable: false }, // 2: credential
      { pubkey: eventAuthority, isSigner: false, isWritable: false }, // 3: event_authority
      {
        pubkey: new PublicKey(lightSystemProgram),
        isSigner: false,
        isWritable: false,
      }, // 4: light_system_program
      {
        pubkey: addressToPublicKey(CPI_SIGNER_PDA),
        isSigner: false,
        isWritable: false,
      }, // 5: cpi_signer
      {
        pubkey: new PublicKey(staticAccounts.registeredProgramPda),
        isSigner: false,
        isWritable: false,
      }, // 6: registered_program_pda
      {
        pubkey: new PublicKey(staticAccounts.accountCompressionAuthority),
        isSigner: false,
        isWritable: false,
      }, // 7: account_compression_authority
      {
        pubkey: new PublicKey(staticAccounts.accountCompressionProgram),
        isSigner: false,
        isWritable: false,
      }, // 8: account_compression_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 9: system_program
      {
        pubkey: compressedAccount.treeInfo.tree,
        isSigner: false,
        isWritable: true,
      }, // 10: state_merkle_tree
      {
        pubkey: compressedAccount.treeInfo.queue,
        isSigner: false,
        isWritable: true,
      }, // 11: output_queue
    ],
    data: closeInstructionData,
  });

  // Create versioned transaction for close
  const {
    blockhash: closeBlockhash,
    lastValidBlockHeight: closeLastValidBlockHeight,
  } = await connection.getLatestBlockhash("confirmed");

  const closeMessageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: closeBlockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
      closeWeb3Ix,
    ],
  }).compileToV0Message([lookupTable]);

  const closeVersionedTx = new VersionedTransaction(closeMessageV0);
  closeVersionedTx.sign([payer, authorizedSigner1]);

  console.log("   - Sending close transaction with lookup table...");
  const closeSig = await connection.sendTransaction(closeVersionedTx, {
    skipPreflight: true,
  });

  await connection.confirmTransaction(
    {
      signature: closeSig,
      blockhash: closeBlockhash,
      lastValidBlockHeight: closeLastValidBlockHeight,
    },
    "confirmed",
  );

  console.log(`   - Compressed attestation closed: ${closeSig}`);

  // Wait for indexer to sync
  await sleep(2000);

  // Verify account is nullified
  const deletedAttestation = await fetchCompressedAttestation(
    lightRpc,
    compressedAddress,
  );
  if (!deletedAttestation) {
    console.log(`   - Compressed attestation successfully nullified`);
  } else {
    console.log(`   - WARNING: Compressed attestation still exists`);
  }

  console.log(
    "\n✅ Compressed Attestation Service demo (Web3.js) completed successfully!",
  );
  console.log(
    "   - Used Address Lookup Table for compressed attestation transaction",
  );
  console.log("   - Lookup Table: ", lutAddress.toBase58());
  console.log("   - Transaction used versioned format (v0) with ALT");
  console.log("   - Successfully closed compressed attestation");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  });
