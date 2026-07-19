const { randomBytes } = require('node:crypto');

const token = randomBytes(32).toString('hex');
console.log(token);
