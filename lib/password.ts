import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${PASSWORD_PREFIX}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, hash] = storedHash.split(':');

  if (prefix !== PASSWORD_PREFIX || !salt || !hash) {
    return false;
  }

  const hashBuffer = Buffer.from(hash, 'hex');
  const inputBuffer = scryptSync(password, salt, hashBuffer.length);

  if (hashBuffer.length !== inputBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, inputBuffer);
}