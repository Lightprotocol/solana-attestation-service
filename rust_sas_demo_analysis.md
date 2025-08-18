# SAS Demo Application Analysis

## Overview

The SAS Demo application demonstrates the complete attestation workflow using the Solana Attestation Service. It shows how to create credentials, define schemas, issue attestations, and verify them on the Solana blockchain.

## Application Structure

### Configuration (`Config` struct - lines 28-52)
```rust
struct Config {
    pub rpc_url: String,                    // "http://127.0.0.1:8899" (local validator)
    pub credential_name: String,            // "TEST-ORGANIZATION"
    pub schema_name: String,                // "THE-BASICS"
    pub schema_version: u8,                 // 1
    pub schema_description: String,         // "Basic user information schema for testing"
    pub schema_layout: Vec<u8>,            // [12, 0, 12] (String, u8, String)
    pub schema_fields: Vec<String>,        // ["name", "age", "country"]
    pub attestation_expiry_days: i64,      // 365 days
}
```

### Test Data Structure (`TestData` - lines 54-69)
```rust
struct TestData {
    pub name: String,     // "test-user"
    pub age: u8,          // 100
    pub country: String,  // "usa"
}
```

### Wallet Management (`Wallets` - lines 71-89)
- **Payer**: Funds all transactions
- **Authorized Signer 1 & 2**: Can create/close attestations
- **Issuer**: Creates credentials and schemas  
- **Test User**: Used as attestation nonce (unique identifier)

## Demo Execution Flow

### Step 1: Fund Payer (lines 199-217)
**Function**: `fund_payer()`
**Purpose**: Request 1 SOL airdrop for transaction fees
**Process**:
1. Request airdrop using `request_airdrop()`
2. Wait for confirmation with spinner
3. Print confirmation signature

### Step 2: Create Credential (lines 219-242)
**Function**: `create_credential()`
**Purpose**: Establish issuer identity and authorization
**Process**:
1. Derive credential PDA using seeds: `["credential", issuer_pubkey, credential_name]`
2. Build `CreateCredential` instruction with:
   - Payer account (funds transaction)
   - Credential PDA (to be created)
   - Authority (issuer who owns credential)
   - Initial authorized signer list
3. Submit transaction signed by issuer
4. Return credential PDA address

### Step 3: Create Schema (lines 244-265)
**Function**: `create_schema()`
**Purpose**: Define attestation data structure and metadata
**Process**:
1. Derive schema PDA using seeds: `["schema", credential_pda, schema_name, schema_version]`
2. Build `CreateSchema` instruction with:
   - Schema metadata (name, description, version)
   - Layout definition: `[12, 0, 12]` = [String, u8, String]
   - Field names: `["name", "age", "country"]`
3. Submit transaction signed by issuer
4. Return schema PDA address

### Step 4: Create Attestation (lines 267-311)
**Function**: `create_attestation()`
**Purpose**: Issue attestation with actual data
**Process**:
1. Prepare test data: `{"name": "test-user", "age": 100, "country": "usa"}`
2. Calculate expiry timestamp (365 days from now)
3. Serialize attestation data using Borsh
4. Use test user pubkey as nonce for uniqueness
5. Derive attestation PDA using seeds: `["attestation", credential_pda, schema_pda, nonce]`
6. Build `CreateAttestation` instruction with serialized data
7. Submit transaction signed by authorized_signer1
8. Return attestation PDA address

### Step 5: Update Authorized Signers (lines 313-334)
**Function**: `update_authorized_signers()`
**Purpose**: Demonstrate credential management
**Process**:
1. Build `ChangeAuthorizedSigners` instruction
2. Add both authorized_signer1 and authorized_signer2 to signer list
3. Submit transaction signed by issuer (credential owner)

### Step 6: Verify Attestations (lines 336-368, called at lines 415-431)
**Function**: `verify_attestation()`
**Purpose**: Demonstrate attestation verification
**Process**:
1. Derive expected attestation PDA for given user
2. Fetch account data from blockchain
3. Deserialize attestation data
4. Check if current timestamp < expiry timestamp
5. Return verification result

**Two verification tests**:
- **Test User**: Should be verified (attestation exists)
- **Random User**: Should fail verification (no attestation)

### Step 7: Close Attestation (lines 370-392)
**Function**: `close_attestation()`  
**Purpose**: Cleanup and rent recovery
**Process**:
1. Build `CloseAttestation` instruction
2. Submit transaction signed by authorized_signer1
3. Account is closed and rent returned to payer

## PDA Derivation Logic

### Credential PDA (lines 111-120)
```rust
seeds: ["credential", issuer_pubkey, credential_name]
program: SOLANA_ATTESTATION_SERVICE_ID
```

### Schema PDA (lines 122-132)
```rust
seeds: ["schema", credential_pda, schema_name, schema_version]
program: SOLANA_ATTESTATION_SERVICE_ID
```

### Attestation PDA (lines 134-149)
```rust
seeds: ["attestation", credential_pda, schema_pda, nonce]
program: SOLANA_ATTESTATION_SERVICE_ID
```

## Transaction Optimization (lines 151-197)

The demo includes sophisticated transaction optimization:

1. **Simulation Phase**: Runs transaction simulation to estimate compute units
2. **Optimization**: Sets precise compute unit limit and priority fee
3. **Execution**: Sends optimized transaction with proper compute budget
4. **Confirmation**: Waits for confirmation with spinner feedback

## Key Concepts Demonstrated

### Hierarchical Account Structure
- **Credential** → **Schema** → **Attestation**
- Each level depends on the previous level's PDA
- Ensures proper access control and organization

### Schema Layout System
- Numeric type identifiers: `12` (String), `0` (u8), `12` (String)
- Corresponds to field names: `["name", "age", "country"]`
- Enables type-safe data validation

### Authority Management
- **Issuer**: Creates credentials and schemas
- **Authorized Signers**: Create and close attestations
- **Dynamic Updates**: Authorized signers can be modified

### Attestation Lifecycle
1. **Creation**: Issue attestation with data and expiry
2. **Verification**: Check existence and expiry status
3. **Closure**: Cleanup and rent recovery

## Demo Output Structure

```
Starting Solana Attestation Service Demo

1. Funding payer wallet...
    - Airdrop completed: [signature]

2. Creating Credential...
    - Credential created - Signature: [signature]
    - Credential PDA: [pubkey]

3. Creating Schema...
    - Schema created - Signature: [signature]
    - Schema PDA: [pubkey]

4. Creating Attestation...
    - Attestation created - Signature: [signature]
    - Attestation PDA: [pubkey]

5. Updating Authorized Signers...
    - Authorized signers updated - Signature: [signature]

6. Verifying Attestations...
    - Test User is verified
    - Random User is not verified

7. Closing Attestation...
    - Closed attestation - Signature: [signature]

Solana Attestation Service demo completed successfully!
```

## Technical Implementation Details

### Serialization
- Uses **Borsh** for deterministic binary serialization
- Ensures consistent data encoding across client and program
- Test data serialized before sending to program

### Error Handling
- Comprehensive `Result<T>` usage throughout
- Graceful error propagation with `?` operator
- Clean error reporting for demo failures

### Network Communication
- **Local validator**: Connects to `http://127.0.0.1:8899`
- **Confirmed commitment**: Waits for transaction confirmation
- **Spinner feedback**: User-friendly transaction status

This demo provides a complete end-to-end example of the Solana Attestation Service workflow, from setup through cleanup, demonstrating all major program functionalities.