import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

export function isValidWebhookSignature(
  body: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(body).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
