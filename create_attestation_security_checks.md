# Create Attestation Security Analysis

## Table of Contents

### Core Function
1. [Process Create Attestation Function](#process-create-attestation-function-security-review) - Creates attestations conforming to schemas

### Quick References
- [QA Checklist for Create Attestation Reviews](#qa-checklist-for-create-attestation-reviews)
- [Error Code Summary](#error-code-summary)

### Security Categories
- **Critical Security Checks** - Must-have validations for attestation creation
- **Business Logic Validation** - Schema and temporal consistency
- **Data Integrity Checks** - Schema conformance and parsing
- **PDA Security** - Account derivation and creation
- **Common Missing Checks** - Frequently overlooked validations
- **Edge Cases to Test** - Boundary conditions and corner cases

---

## Process Create Attestation Function Security Review

**Context**: The `process_create_attestation` function creates new attestations that conform to existing schemas. This is a critical operation that validates data against schema layouts and creates permanent on-chain records.

**Location**: `program/src/processor/create_attestation.rs:21-136`

---

## Critical Security Checks (Must Have)

### 1. Instruction Data Parsing
- **Function**: `process_instruction_data(instruction_data)?` - **Line**: 27
- **Purpose**: Parse nonce (32), data_len (4), data_bytes (variable), expiry (8)
- **Validation**: `require_len!` macro ensures bounds checking
- **QA Note**: Test with truncated or oversized instruction data

### 2. Account Count Validation
- **Function**: Array destructuring `let [payer_info, authorized_signer, credential_info, schema_info, attestation_info, system_program] = accounts` - **Line**: 28-32
- **Error**: `ProgramError::NotEnoughAccountKeys`
- **Purpose**: Ensures exactly 6 accounts provided
- **Critical**: Function fails fast if insufficient accounts

### 3. Authority Signature Validation
- **Function**: `verify_signer(authorized_signer, false)?` - **Line**: 35
- **Error**: `ProgramError::MissingRequiredSignature`
- **Purpose**: Verify authorized signer has signed transaction
- **QA Focus**: Test with unsigned authorized signer account

### 4. System Program Validation
- **Function**: `verify_system_program(system_program)?` - **Line**: 38
- **Error**: `ProgramError::IncorrectProgramId`
- **Purpose**: Ensures proper account creation mechanism
- **Implementation**: Verifies `system_program.key() == pinocchio_system::ID`

---

## Account Ownership Validation

### 5. Credential Account Ownership
- **Function**: `verify_owner_mutability(credential_info, program_id, false)?` - **Line**: 40
- **Error**: `ProgramError::InvalidAccountOwner`
- **Purpose**: Credential must be owned by attestation program
- **Critical**: Prevents use of fake credential accounts

### 6. Schema Account Ownership
- **Function**: `verify_owner_mutability(schema_info, program_id, false)?` - **Line**: 41
- **Error**: `ProgramError::InvalidAccountOwner`
- **Purpose**: Schema must be owned by attestation program
- **Critical**: Prevents use of fake schema accounts

---

## Account Data Validation

### 7. Credential Data Deserialization
- **Function**: `Credential::try_from_bytes(&credential_data)?` - **Line**: 44
- **Purpose**: Parse credential account data and validate discriminator
- **Validation**: Ensures account contains valid credential structure
- **QA Check**: Test with malformed credential account data

### 8. Credential Authority Validation
- **Function**: `credential.validate_authorized_signer(authorized_signer.key())?` - **Line**: 47
- **Error**: Custom validation error
- **Purpose**: Verify signer is in credential's authorized signer list
- **Critical**: Multi-layered authorization (signature + membership)

### 9. Schema Data Deserialization
- **Function**: `Schema::try_from_bytes(&schema_data)?` - **Line**: 50
- **Purpose**: Parse schema account data and validate discriminator
- **Validation**: Ensures account contains valid schema structure

---

## Business Logic Validation

### 10. Schema State Validation
- **Function**: `if schema.is_paused` check - **Line**: 53-55
- **Error**: `AttestationServiceError::SchemaPaused`
- **Purpose**: Prevent attestation creation when schema is administratively paused
- **QA Focus**: Test attestation creation on paused schemas (should fail)

### 11. Schema-Credential Binding
- **Function**: `if schema.credential.ne(credential_info.key())` - **Line**: 58-60
- **Error**: `AttestationServiceError::InvalidCredential`
- **Purpose**: Schema must belong to the credential being used
- **Critical**: Cross-account consistency validation

### 12. Temporal Validation (Expiry Check)
- **Function**: `Clock::get()` + timestamp comparison - **Line**: 63-66
- **Error**: `AttestationServiceError::InvalidAttestationData`
- **Logic**: 
  - `expiry == 0`: Permanent attestation (valid)
  - `expiry > current_time`: Future expiration (valid)
  - `expiry < current_time && expiry != 0`: Past expiration (invalid)
- **QA Focus**: Test edge cases with clock manipulation

---

## PDA Security and Account Creation

### 13. PDA Derivation and Validation
- **Function**: `SolanaPubkey::find_program_address()` + address comparison - **Line**: 71-84
- **Seeds**: `[ATTESTATION_SEED, credential_key, schema_key, nonce]`
- **Validation**: `attestation_info.key().ne(&attestation_pda.to_bytes())`
- **Error**: `AttestationServiceError::InvalidAttestation`
- **Critical**: Prevents attestation account substitution attacks

### 14. Account Space Calculation
- **Function**: Manual space calculation - **Line**: 97
- **Layout**: discriminator(1) + nonce(32) + credential(32) + schema(32) + data(4+len) + signer(32) + expiry(8) + token_account(32)
- **Dynamic Sizing**: Account size varies based on attestation data length
- **Purpose**: Proper rent calculation for account creation

### 15. PDA Account Creation
- **Function**: `create_pda_account()` - **Line**: 109-117
- **Purpose**: Create and initialize attestation PDA with proper signer seeds
- **Rent**: Uses `Rent::get()` for rent exemption calculation
- **Critical**: Atomic account creation with program ownership

---

## Data Integrity Validation

### 16. Schema Layout Validation
- **Function**: `attestation.validate_data(schema.layout)?` - **Line**: 130
- **Purpose**: Verify attestation data conforms to schema's field types and structure
- **Implementation**: Validates data bytes against schema layout specification
- **Critical**: Ensures type safety and data integrity
- **QA Focus**: Test with malformed data, wrong types, missing fields

### 17. Account Data Storage
- **Function**: `attestation_data.copy_from_slice(&attestation.to_bytes())` - **Line**: 133
- **Purpose**: Write validated attestation data to account
- **Implementation**: Atomic write of serialized attestation structure
- **Final Step**: Completes attestation creation process

---

## QA Checklist for Create Attestation Reviews

### Must Verify:
1. **Account count validation** - Exactly 6 accounts provided?
2. **Authority validation** - Authorized signer signed and in credential's signer list?
3. **Account ownership** - Credential and schema owned by program?
4. **Schema state** - Schema not paused?
5. **Schema binding** - Schema belongs to credential?
6. **PDA derivation** - Attestation account matches derived PDA?
7. **Data validation** - Attestation data conforms to schema layout?
8. **Temporal validation** - Expiry timestamp valid (0 or future)?

### Common Missing Checks:
1. **Schema pause state validation** (often overlooked)
2. **Schema-credential ownership binding** 
3. **PDA address validation** (substitution attacks)
4. **Data layout conformance** (type mismatches)
5. **Expiry edge cases** (zero vs past timestamps)
6. **Instruction data bounds checking**
7. **Dual authority validation** (signature + credential membership)

### Edge Cases to Test:
- Attestation with expiry = 0 (permanent - should succeed)
- Attestation with past expiry (should fail)
- Attestation with future expiry (should succeed)
- Schema-credential mismatch (different owners - should fail)
- Paused schema usage (should fail)
- Malformed attestation data (wrong types/structure - should fail)
- Insufficient instruction data (truncated - should fail)
- Maximum data length attestations
- Unauthorized signer attempts (not in credential - should fail)
- Incorrect PDA derivation (should fail)
- Account count mismatch (< 6 accounts - should fail)

---

## Error Code Summary

### Custom Attestation Service Errors
- **`AttestationServiceError::SchemaPaused`** - Cannot create attestations for paused schemas (line 54)
- **`AttestationServiceError::InvalidCredential`** - Schema does not belong to provided credential (line 59)
- **`AttestationServiceError::InvalidAttestation`** - PDA derivation mismatch (line 83)
- **`AttestationServiceError::InvalidAttestationData`** - Expiry timestamp validation failure or data layout mismatch (line 65, 130)

### Standard Program Errors
- **`ProgramError::NotEnoughAccountKeys`** - Insufficient accounts provided, expects 6 (line 31)
- **`ProgramError::MissingRequiredSignature`** - Authorized signer not signed (line 35)
- **`ProgramError::InvalidAccountOwner`** - Credential/schema not owned by program (lines 40, 41)
- **`ProgramError::IncorrectProgramId`** - System program validation failure (line 38)

### Account Creation Errors
- **`ProgramError::InvalidAccountData`** - Account space calculation or creation issues
- **Rent-related errors** - Insufficient lamports for rent exemption

### By Function Quick Reference
- **process_create_attestation**: NotEnoughAccountKeys, MissingRequiredSignature, IncorrectProgramId, InvalidAccountOwner, SchemaPaused, InvalidCredential, InvalidAttestation, InvalidAttestationData

---

**Reference**: Solana Attestation Service `program/src/processor/create_attestation.rs` - Process Create Attestation function with comprehensive security validation