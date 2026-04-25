export type AuthEnv = {
  STATUS_PUBLIC?: string;
  STATUS_USERNAME?: string;
  STATUS_PASSWORD?: string;
};

const unauthorizedResponse = (): Response =>
  new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Status Page"' },
  });

async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);

  let mismatch = 0;
  for (let i = 0; i < viewA.length; i++) {
    mismatch |= viewA[i] ^ viewB[i];
  }
  return mismatch === 0;
}

export async function checkAuth(request: Request, env: AuthEnv): Promise<Response | undefined> {
  if (env.STATUS_PUBLIC === 'true') {
    return undefined;
  }

  if (!env.STATUS_USERNAME || !env.STATUS_PASSWORD) {
    return new Response('Forbidden', { status: 403 });
  }

  const authHeader = request.headers.get('Authorization');
  const basicAuthPrefix = 'Basic ';
  if (!authHeader?.startsWith(basicAuthPrefix)) {
    return unauthorizedResponse();
  }

  const base64Credentials = authHeader.slice(basicAuthPrefix.length);
  let credentials: string;
  try {
    credentials = atob(base64Credentials);
  } catch {
    return unauthorizedResponse();
  }

  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    return unauthorizedResponse();
  }

  const username = credentials.slice(0, colonIndex);
  const password = credentials.slice(colonIndex + 1);

  const [usernameMatch, passwordMatch] = await Promise.all([
    timingSafeCompare(username, env.STATUS_USERNAME),
    timingSafeCompare(password, env.STATUS_PASSWORD),
  ]);

  if (!usernameMatch || !passwordMatch) {
    return unauthorizedResponse();
  }

  return undefined;
}
