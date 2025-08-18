# Create Attestation Security Analysis

**Context**: The `process_create_attestation` function creates new attestations that conform to existing schemas. This is a critical operation that validates data against schema layouts and creates permanent on-chain records.

**Location**: `/home/ananas/dev/solana-attestation-service/program/src/processor/create_attestation.rs:21-136`

---

## Critical Security Checks (Must Have)

### 1. Account Authority Validation
- **Signer Verification**: `verify_signer(authorized_signer, false)` - **Error**: `ProgramError::MissingRequiredSignature`
  - **Critical**: Authorized signer must have signed the transaction
- **Authority Authentication**: `credential.validate_authorized_signer(authorized_signer.key())` - **Error**: Custom validation
  - **Purpose**: Ensures only authorized signers from credential can create attestations
  - **QA Focus**: Test with unauthorized signers to ensure rejection

### 2. Account Ownership Validation  
- **Program Ownership**: Credential and Schema must be owned by attestation program
  - **Implementation**: `verify_owner_mutability(credential_info, program_id, false)`
  - **Implementation**: `verify_owner_mutability(schema_info, program_id, false)`
  - **Error**: `ProgramError::InvalidAccountOwner`
  - **Critical**: Prevents use of fake credential/schema accounts

### 3. System Program Validation
- **System Program Check**: `verify_system_program(system_program)` - **Error**: `ProgramError::IncorrectProgramId`
  - **Purpose**: Ensures proper account creation mechanism

### 4. Cross-Account Consistency
- **Schema-Credential Binding**: `schema.credential.ne(credential_info.key())` - **Error**: `AttestationServiceError::InvalidCredential`
  - **Critical**: Schema must belong to the credential being used
  - **QA Focus**: Test with schema from different credential (should fail)

---

## Business Logic Validation

### 5. Schema State Validation
- **Pause Check**: `schema.is_paused` - **Error**: `AttestationServiceError::SchemaPaused`
  - **Purpose**: Prevents attestation creation when schema is administratively paused
  - **QA Check**: Test attestation creation on paused schemas

### 6. Temporal Validation
- **Expiry Validation**: Complex timestamp logic at `create_attestation.rs:63-66`
  ```rust
  let clock = Clock::get()?;
  if args.expiry < clock.unix_timestamp && args.expiry != 0 {
      return Err(AttestationServiceError::InvalidAttestationData.into());
  }
  ```
  - **Rules**: 
    - `expiry = 0`: No expiration (permanent attestation)
    - `expiry > current_time`: Valid future expiration
    - `expiry < current_time && expiry != 0`: Invalid (past expiration)
  - **QA Focus**: Test edge cases with clock manipulation

---

## PDA Security and Account Creation

### 7. PDA Derivation Verification
- **PDA Calculation**: Uses `SolanaPubkey::find_program_address()` with seeds:
  - `ATTESTATION_SEED` (constant)
  - `credential_info.key()` (credential PDA)  
  - `schema_info.key()` (schema PDA)
  - `args.nonce` (unique identifier from instruction data)
- **Address Validation**: `attestation_info.key().ne(&attestation_pda.to_bytes())` - **Error**: `AttestationServiceError::InvalidAttestation`
  - **Critical**: Prevents attestation account substitution attacks
  - **QA Focus**: Test with incorrect PDA addresses

### 8. Account Space Calculation
- **Fixed Layout** at `create_attestation.rs:88-97`:
  ```rust
  // discriminator - 1
  // nonce - 32  
  // Credential - 32
  // Schema - 32
  // data - 4 + len
  // signer - 32
  // expiry - 8
  // token account - 32
  let space = 1 + 32 + 32 + 32 + (4 + args.data.len()) + 32 + 8 + 32;
  ```
- **Dynamic Sizing**: Account size varies based on attestation data length
- **QA Check**: Verify space calculation matches actual account layout

---

## Data Integrity and Schema Compliance

### 9. Schema Layout Validation
- **Data Conformance**: `attestation.validate_data(schema.layout)` - **Error**: Custom validation
  - **Critical**: Attestation data must match schema's field types and structure
  - **Implementation**: Validates data bytes against schema layout specification
  - **QA Focus**: Test with malformed data, wrong types, missing fields

### 10. Instruction Data Parsing
- **Structured Parsing** at `create_attestation.rs:144-167`:
  ```rust
  // nonce (32 bytes)
  // data_len (4 bytes, little-endian u32)  
  // data_bytes (variable length)
  // expiry (8 bytes, little-endian i64)
  ```
- **Bounds Checking**: `require_len!` macro ensures sufficient data length
- **QA Focus**: Test with truncated instruction data, invalid lengths

---

## Token Integration Support

### 11. Optional Token Account
- **Token Account Parameter**: `token_account: Option<Pubkey>` for tokenized attestations
- **Default Handling**: `token_account.unwrap_or_default()` stores zero pubkey for non-tokenized
- **Purpose**: Enables attestation-token binding for tokenized schemas

---

## Atomicity and State Management

### 12. Account Creation and Data Storage
- **PDA Account Creation**: `create_pda_account()` with proper signer seeds
- **Atomic Write**: `attestation_data.copy_from_slice(&attestation.to_bytes())`
- **Rent Exemption**: Proper rent calculation via `Rent::get()`

---

## Instruction Data Security

### 13. Input Validation and Parsing
- **Length Validation**: All data reads protected by `require_len!` macro
- **Type Safety**: Proper little-endian decoding for multi-byte values
- **Memory Safety**: Uses slice operations with bounds checking

---

## QA Checklist for Create Attestation Reviews

### Must Verify:
1. **Authority validation** - Authorized signer in credential's signer list?
2. **Account ownership** - Credential and schema owned by program?
3. **Schema state** - Schema not paused?
4. **Schema binding** - Schema belongs to credential?
5. **PDA derivation** - Attestation account matches derived PDA?
6. **Data validation** - Attestation data conforms to schema layout?
7. **Temporal validation** - Expiry timestamp valid (0 or future)?

### Common Missing Checks:
1. **Schema pause state** (often overlooked)
2. **Schema-credential ownership binding**
3. **PDA address validation** (substitution attacks)
4. **Data layout conformance** (type mismatches)
5. **Expiry edge cases** (zero vs past timestamps)
6. **Instruction data bounds checking**

### Edge Cases to Test:
- Attestation with expiry = 0 (permanent)
- Attestation with past expiry (should fail)
- Attestation with future expiry (should succeed)
- Schema-credential mismatch (different owners)
- Paused schema usage (should fail)  
- Malformed attestation data (wrong types/structure)
- Insufficient instruction data (truncated)
- Maximum data length attestations
- Unauthorized signer attempts
- Incorrect PDA derivation

### Security Considerations:
- **Multi-layered authorization** - both signature and credential membership required
- **Schema immutability during creation** - validates against current schema state  
- **Unique nonce enforcement** - prevents duplicate attestations through PDA uniqueness
- **Temporal consistency** - prevents backdated attestations
- **Data integrity** - schema layout validation ensures type safety

---

## Error Code Summary

### Custom Attestation Service Errors
- **`AttestationServiceError::SchemaPaused`** - Cannot create attestations for paused schemas
- **`AttestationServiceError::InvalidCredential`** - Schema does not belong to provided credential
- **`AttestationServiceError::InvalidAttestation`** - PDA derivation mismatch or data validation failure
- **`AttestationServiceError::InvalidAttestationData`** - Expiry timestamp validation failure or data layout mismatch

### Standard Program Errors  
- **`ProgramError::NotEnoughAccountKeys`** - Insufficient accounts provided (expects 6)
- **`ProgramError::MissingRequiredSignature`** - Authorized signer not signed
- **`ProgramError::InvalidAccountOwner`** - Credential/schema not owned by program
- **`ProgramError::IncorrectProgramId`** - System program validation failure

### Account Creation Errors
- **`ProgramError::InvalidAccountData`** - Account space calculation or creation issues
- **Rent-related errors** - Insufficient lamports for rent exemption

---

**Reference**: Solana Attestation Service `program/src/processor/create_attestation.rs` - Process Create Attestation function and supporting shared utilities