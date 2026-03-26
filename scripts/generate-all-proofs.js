#!/usr/bin/env node
/**
 * Generate all validator proofs.
 *
 * This script discovers all validator modules in packages/gsd-tools/src/validation/,
 * runs them through their valid/invalid input sets, and generates cryptographic proofs
 * using ProofHarness.
 */

const fs = require('fs');
const path = require('path');
const { ProofHarness } = require('../packages/gsd-tools/src/validation/ProofHarness');

const VALIDATION_DIR = path.join(process.cwd(), 'packages', 'gsd-tools', 'src', 'validation');
const CONTRACTS_DIR = path.join(process.cwd(), 'contracts');
const PHASE_DIR = path.join(process.cwd(), '.planning', 'phases', '52-truth-enforcement-hardening');
const INPUTS_DIR = path.join(PHASE_DIR, 'proofs', 'inputs');
const PROOFS_DIR = path.join(PHASE_DIR, 'proofs');

// Dry-run flag support
const dryRun = process.argv.includes('--dry-run');

/**
 * Discover validators from contract inventory and require matching validator modules.
 */
function discoverValidators() {
  const contractFiles = fs.readdirSync(CONTRACTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => path.basename(entry.name, '.yaml'))
    .sort();

  if (contractFiles.length === 0) {
    throw new Error(`No contract files found in ${CONTRACTS_DIR}`);
  }

  for (const validatorName of contractFiles) {
    const validatorPath = path.join(VALIDATION_DIR, `${validatorName}.js`);
    if (!fs.existsSync(validatorPath)) {
      throw new Error(`Validator module not found for contract ${validatorName}: ${validatorPath}`);
    }
  }

  return contractFiles;
}

/**
 * Ensure input files exist for a validator. Generate synthetic samples if missing.
 * @param {string} validatorName
 */
function ensureInputFiles(validatorName) {
  const validPath = path.join(INPUTS_DIR, `${validatorName}.valid.json`);
  const invalidPath = path.join(INPUTS_DIR, `${validatorName}.invalid.json`);

  if (fs.existsSync(validPath) && fs.existsSync(invalidPath)) {
    // Already exist
    return { valid: JSON.parse(fs.readFileSync(validPath, 'utf-8')), invalid: JSON.parse(fs.readFileSync(invalidPath, 'utf-8')) };
  }

  // Generate synthetic inputs based on validator type
  let validSamples = [];
  let invalidSamples = [];

  switch (validatorName) {
    case 'json_validator':
      // Valid: simple objects, arrays, literals
      for (let i = 0; i < 50; i++) {
        validSamples.push(JSON.stringify({ type: 'json', index: i, data: { x: i, y: i * 2 } }));
        validSamples.push(JSON.stringify([i, i + 1, i + 2]));
        validSamples.push(JSON.stringify(`string value ${i}`));
      }
      // Invalid: malformed JSON
      for (let i = 0; i < 50; i++) {
        invalidSamples.push('{ invalid json: }');
        invalidSamples.push('[missing, bracket]');
        invalidSamples.push('{ "unclosed": true ');
      }
      break;

    case 'config_validator':
      // Valid configs
      for (let i = 0; i < 50; i++) {
        validSamples.push(JSON.stringify({ mode: 'strict', retries: 3, timeout: 1000 + i }));
        validSamples.push(JSON.stringify({ mode: 'lenient', retries: 0, timeout: 5000 }));
      }
      // Invalid: missing fields or wrong types
      for (let i = 0; i < 50; i++) {
        invalidSamples.push(JSON.stringify({ mode: 'strict' })); // missing retries/timeout
        invalidSamples.push(JSON.stringify({ mode: 'lenient', retries: 'three' })); // wrong type
        invalidSamples.push(JSON.stringify({ timeout: 1000 })); // missing mode and retries
      }
      break;

    case 'phase_input_validator':
      // Valid phase inputs
      for (let i = 0; i < 50; i++) {
        validSamples.push(JSON.stringify({
          phase: 52,
          plan: i,
          tasks: [
            { id: `${i}-01`, title: 'Task 1' },
            { id: `${i}-02`, title: 'Task 2' }
          ]
        }));
      }
      // Invalid
      for (let i = 0; i < 50; i++) {
        invalidSamples.push(JSON.stringify({ plan: i, tasks: [] })); // missing phase
        invalidSamples.push(JSON.stringify({ phase: 52, tasks: [] })); // missing plan
        invalidSamples.push(JSON.stringify({ phase: 52, plan: i })); // missing tasks
        invalidSamples.push(JSON.stringify({ phase: 52, plan: i, tasks: 'not an array' }));
        invalidSamples.push(JSON.stringify({ phase: 52, plan: i, tasks: [{ title: 'no id' }] }));
      }
      break;

    case 'contract_validator':
      // Valid contracts
      for (let i = 0; i < 50; i++) {
        validSamples.push(JSON.stringify({
          validator: validatorName,
          version: '1.0.0',
          contract_hash: 'a'.repeat(64)
        }));
      }
      // Invalid
      for (let i = 0; i < 50; i++) {
        invalidSamples.push(JSON.stringify({ validator: validatorName })); // missing version, contract_hash
        invalidSamples.push(JSON.stringify({ validator: validatorName, version: '1.0', contract_hash: 'short' }));
        invalidSamples.push(JSON.stringify({ version: '1.0.0', contract_hash: 'a'.repeat(64) })); // missing validator
      }
      break;

    default:
      // For unknown validators, create generic strings
      for (let i = 0; i < 50; i++) validSamples.push(`valid sample ${i}`);
      for (let i = 0; i < 50; i++) invalidSamples.push(`invalid sample ${i}`);
  }

  // Save to files
  fs.writeFileSync(validPath, JSON.stringify(validSamples, null, 2));
  fs.writeFileSync(invalidPath, JSON.stringify(invalidSamples, null, 2));

  return { valid: validSamples, invalid: invalidSamples };
}

/**
 * Run a validator against its input set and collect metrics.
 * @param {string} validatorName
 * @returns {object} testResults
 */
function runValidation(validatorName) {
  const { valid, invalid } = ensureInputFiles(validatorName);

  // Load validator module
  const validatorPath = path.join(VALIDATION_DIR, `${validatorName}.js`);
  if (!fs.existsSync(validatorPath)) {
    throw new Error(`Validator module not found: ${validatorPath}`);
  }
  const validator = require(validatorPath);

  let passedValid = 0;
  let rejectedInvalid = 0;

  // Validate valid inputs — should all return valid: true
  for (const content of valid) {
    const result = validator.validate(content);
    if (result.valid) passedValid++;
  }

  // Validate invalid inputs — should all return valid: false
  for (const content of invalid) {
    const result = validator.validate(content);
    if (!result.valid) rejectedInvalid++;
  }

  const total_cases = valid.length + invalid.length;
  const false_negatives = valid.length - passedValid;   // valid inputs incorrectly rejected
  const false_positives = invalid.length - rejectedInvalid; // invalid inputs incorrectly accepted

  return {
    total_cases,
    passed_valid: passedValid,
    rejected_invalid: rejectedInvalid,
    false_negatives,
    false_positives,
  };
}

/**
 * Main generation loop
 */
function main() {
  const validators = discoverValidators();
  if (validators.length === 0) {
    console.error('No validators found in', VALIDATION_DIR);
    process.exit(1);
  }

  console.log(dryRun
    ? 'Dry run: scripts/generate-all-proofs.js validated inventory and would write proofs'
    : 'Generating proof artifacts');
  console.log(`Discovered validators: ${validators.join(', ')}`);

  if (!dryRun) {
    fs.mkdirSync(INPUTS_DIR, { recursive: true });
    fs.mkdirSync(PROOFS_DIR, { recursive: true });
  }

  for (const name of validators) {
    console.log(`\nGenerating proof for ${name}...`);

    try {
      const testResults = runValidation(name);
      console.log(`Results:`, testResults);

      if (testResults.false_negatives > 0 || testResults.false_positives > 0) {
        console.warn(`⚠ Validator ${name} has errors: false_negatives=${testResults.false_negatives}, false_positives=${testResults.false_positives}`);
        // Continue anyway; proof will show errors
      } else {
        console.log(`✓ ${name} passes all valid/invalid cases`);
      }

      const proof = ProofHarness.generateProof(name, testResults);
      const verification = ProofHarness.verifyProof(proof);
      if (!verification.valid) {
        throw new Error(`Generated proof failed verification: ${verification.reason}`);
      }

      if (dryRun) {
        console.log(`Dry run verified proof payload for ${name}`);
      } else {
        const proofPath = path.join(PROOFS_DIR, `${name}.proof.json`);
        fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
        console.log(`Proof written: ${proofPath}`);
      }
    } catch (err) {
      console.error(`✗ Failed to generate proof for ${name}:`, err.message);
      process.exitCode = 1;
    }
  }

  console.log('\nProof generation complete.');
  process.exit(process.exitCode || 0);
}

main();
