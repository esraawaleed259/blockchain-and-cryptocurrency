"use strict";
const blindSignatures = require('blind-signatures');
const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Generate RSA key pair with n, e, d
let keyPair;
try {
  keyPair = blindSignatures.keyGeneration({ b: 2048, keyType: 'rsa' });
} catch (error) {
  throw new Error("Error during key generation: " + error.message);
}

const N = keyPair.n;
const E = keyPair.e;
const D = keyPair.d;

if (!D) {
  throw new Error("Private key exponent `d` is missing! Key generation failed.");
}

const BANK_KEY = { keyPair }; // Store the key pair as an object

/**
 * Sign a blinded coin hash using the bank's private key
 */
function signCoin(blindedCoinHash) {
  try {
    return blindSignatures.sign({
      blinded: blindedCoinHash,
      key: BANK_KEY.keyPair, // Must include n and d
    });
  } catch (error) {
    throw new Error("Error signing the coin: " + error.message);
  }
}

/**
 * Parse the coin string into left and right identity hash arrays
 */
function parseCoin(s) {
  const [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: expected ${BANK_STR}, got ${cnst}`);
  }
  return [leftHashes.split(','), rightHashes.split(',')];
}

/**
 * Accept a coin and return RIS (revealed identity strings)
 */
function acceptCoin(coin) {
  const isValid = blindSignatures.verify({
    unblinded: coin.signature,
    N: coin.n,
    E: coin.e,
    message: coin.toString()
  });

  if (!isValid) throw new Error("Invalid signature");

  const [leftHashes, rightHashes] = parseCoin(coin.toString());
  const ris = [];

  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    const chooseLeft = utils.randInt(2) === 0;
    const value = coin.getRis(chooseLeft, i);
    const hashCheck = utils.hash(value);

    if (chooseLeft && hashCheck !== leftHashes[i]) {
      throw new Error("Left hash mismatch");
    }
    if (!chooseLeft && hashCheck !== rightHashes[i]) {
      throw new Error("Right hash mismatch");
    }

    ris.push(value.toString('hex'));
  }

  return ris;
}

/**
 * Check if the same coin was spent twice, and identify the cheater.
 */
function determineCheater(guid, ris1, ris2) {
  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    if (ris1[i] !== ris2[i]) {
      const left = Buffer.from(ris1[i], 'hex');
      const right = Buffer.from(ris2[i], 'hex');
      const combined = Buffer.alloc(left.length);

      for (let j = 0; j < left.length; j++) {
        combined[j] = left[j] ^ right[j];
      }

      const result = combined.toString();
      if (result.startsWith(IDENT_STR)) {
        const name = result.split(':')[1];
        console.log(`Double-spending detected! User: ${name}`);
        return;
      }
    }
  }

  console.log("Merchants submitted identical RIS. Merchant is cheating.");
}

// ==== TEST CASE ====
// Ensure key generation works correctly
console.log("Creating coin for Alice...");
const coin = new Coin('alice', 20, N, E);

// Manually blind the coin
let blindedData;
try {
  blindedData = blindSignatures.blind({
    message: coin.toString(),
    N,
    E
  });
} catch (error) {
  throw new Error("Error during blind operation: " + error.message);
}

coin.blinded = blindedData.blinded;
coin.blindingFactor = blindedData.r;

console.log("Bank signing the blinded hash...");
coin.signature = signCoin(coin.blinded);

console.log("Unblinding the signature...");
try {
  coin.signature = blindSignatures.unblind({
    signed: coin.signature,
    N,
    r: coin.blindingFactor
  });
} catch (error) {
  throw new Error("Error during unblind operation: " + error.message);
}

// Merchant 1 accepts coin
console.log("Merchant 1 accepting...");
let ris1;
try {
  ris1 = acceptCoin(coin);
} catch (error) {
  throw new Error("Error during Merchant 1 acceptance: " + error.message);
}

// Merchant 2 accepts same coin
console.log("Merchant 2 accepting...");
let ris2;
try {
  ris2 = acceptCoin(coin);
} catch (error) {
  throw new Error("Error during Merchant 2 acceptance: " + error.message);
}

// Check for double-spending
console.log("Checking for double-spending...");
determineCheater(coin.guid, ris1, ris2);

// Check for merchant fraud
console.log("Checking for merchant fraud...");
determineCheater(coin.guid, ris1, ris1);
