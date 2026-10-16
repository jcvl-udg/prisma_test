import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest } from 'next/server';
import { handlers } from '../../../server/auth';

export const config = {
  api: { bodyParser: false },
};

function requestHeaders(req: NextApiRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (value) headers.set(name, value.join(', '));
  }
  return headers;
}

async function toWebRequest(req: NextApiRequest): Promise<NextRequest> {
  const protocol =
    req.headers['x-forwarded-proto']?.toString().split(',')[0] ??
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host =
    req.headers['x-forwarded-host']?.toString().split(',')[0] ?? req.headers.host;

  if (!host || !req.url || !req.method) {
    throw new Error('La petición de Auth.js no contiene URL, host o método');
  }

  const chunks: string[] = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    }
  }

  const body = chunks.length ? chunks.join('') : undefined;
  const request = new Request(`${protocol}://${host}${req.url}`, {
    method: req.method,
    headers: requestHeaders(req),
    body,
  });
  return new NextRequest(request);
}

export default async function authRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const method = req.method;
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end('Method Not Allowed');
  }

  const response = await handlers[method](await toWebRequest(req));
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie' && name !== 'content-length') {
      res.setHeader(name, value);
    }
  });

  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);

  res.status(response.status);
  const body = Buffer.from(await response.arrayBuffer());
  return body.length > 0 ? res.send(body) : res.end();
}
