// ported from rust (lrclib)

const crypto = require('crypto');

function verifyNonce(hashed, target) {
    if (hashed.length !== target.length) {
        return false;
    }

    for (let i = 0; i < hashed.length; i++) {
        if (hashed[i] > target[i]) {
            return false;
        } else if (hashed[i] < target[i]) {
            break;
        }
    }

    return true;
}

function solveChallenge(prefix, target_hex) {
    let nonce = 0;
    const target = Buffer.from(target_hex, 'hex');

    while (true) {
        const input = `${prefix}${nonce}`;
        const hashed = crypto.createHash('sha256').update(input).digest();

        if (verifyNonce(hashed, target)) {
            return nonce.toString();
        }

        nonce += 1;
    }
}

module.exports = { solveChallenge };