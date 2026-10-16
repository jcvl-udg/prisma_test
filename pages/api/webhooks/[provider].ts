import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { createProviderRegistry } from '../../../server/providers/router';
import { ProviderNotFoundError } from '../../../server/providers/types';
import {
  isValidWebhookSignature,
  MAX_WEBHOOK_BODY_BYTES,
} from '../../../server/providers/webhook';

class WebhookBodyTooLargeError extends Error {}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_WEBHOOK_BODY_BYTES) {
      throw new WebhookBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const providerCode = req.query.provider;
  if (typeof providerCode !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(providerCode)) {
    return res.status(400).json({ error: 'Proveedor inválido' });
  }

  let body: Buffer;
  try {
    body = await readRawBody(req);
  } catch (error) {
    if (error instanceof WebhookBodyTooLargeError) {
      return res.status(413).json({ error: 'Webhook demasiado grande' });
    }
    console.error('[providers:webhook] no se pudo leer el cuerpo', error);
    return res.status(400).json({ error: 'Cuerpo del webhook inválido' });
  }

  const secret = process.env[`PROVIDER_WEBHOOK_SECRET_${providerCode.toUpperCase()}`];
  if (!secret) {
    console.error(`[providers:webhook] falta el secreto para ${providerCode.toUpperCase()}`);
    return res.status(503).json({ error: 'Webhook no configurado' });
  }
  const signature = req.headers['x-provider-signature'];
  if (!isValidWebhookSignature(body, Array.isArray(signature) ? signature[0] : signature, secret)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  try {
    const provider = createProviderRegistry(prisma).get(providerCode);
    if (!provider.handleWebhook) {
      return res.status(501).json({ error: 'El proveedor no admite webhooks' });
    }
    await provider.handleWebhook(payload, {
      'x-provider-signature': Array.isArray(signature) ? signature[0] ?? '' : signature ?? '',
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    if (error instanceof ProviderNotFoundError) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    console.error(
      `[providers:webhook] error procesando evento de ${providerCode}`,
      error instanceof Error ? error.name : 'error desconocido',
    );
    return res.status(500).json({ error: 'No se pudo procesar el webhook' });
  }
}

export const config = {
  api: { bodyParser: false },
};
