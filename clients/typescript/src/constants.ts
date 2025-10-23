/**
 * Program constants for Solana Attestation Service.
 *
 * These constants are not auto-generated and should be maintained manually.
 */

import type { Address } from '@solana/kit';

/**
 * The default allowed address tree for compressed attestations.
 * This is the address merkle tree that is used for address validation.
 */
export const ALLOWED_ADDRESS_TREE = 'amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx' as Address<'amt2kaJA14v3urZbZvnc5v2np8jqvc4Z8zDep5wbtzx'>;

/**
 * Light Protocol CPI signer PDA used for compression operations.
 */
export const CPI_SIGNER_PDA = '4J8ZeHg2hqPTKv1ck9bqucEcbVDBS6fVZsNCuThmDHFC' as Address<'4J8ZeHg2hqPTKv1ck9bqucEcbVDBS6fVZsNCuThmDHFC'>;
