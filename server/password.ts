import bcrypt from 'bcryptjs';

export const PASSWORD_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_BYTES = 72;

export function isValidPassword(password: string): boolean {
  return (
    Buffer.byteLength(password, 'utf8') <= MAX_BCRYPT_BYTES &&
    Array.from(password).length >= MIN_PASSWORD_LENGTH
  );
}

export function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) {
    throw new Error(
      'La contraseña debe tener al menos 8 caracteres y un máximo de 72 bytes UTF-8',
    );
  }
  return bcrypt.hash(password, PASSWORD_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!isValidPassword(password)) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}
