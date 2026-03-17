import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;

function getSecretKey(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET_KEY || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error('CREDENTIALS_SECRET_KEY o NEXTAUTH_SECRET es requerido para cifrar credenciales');
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivBase64, tagBase64, encryptedBase64] = payload.split('.');

  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error('Payload cifrado inválido');
  }

  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}