const crypto = require('crypto');

function generateApiKey(length = 32) {
  return crypto.randomBytes(length).toString('hex'); // hex string twice the length of bytes
}

const superSecretKey = generateApiKey(32); // 64 hex chars
// console.log('Your super secrete API key:', superSecretKey);
