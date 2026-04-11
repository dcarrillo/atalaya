import { describe, it, expect } from 'vitest';
import { checkAuth, type AuthEnv } from './auth.js';

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  return new Request('https://example.com/', { headers });
}

function encodeBasic(username: string, password: string): string {
  return 'Basic ' + btoa(`${username}:${password}`);
}

describe('checkAuth', () => {
  it('allows access when STATUS_PUBLIC is true', async () => {
    const env: AuthEnv = { STATUS_PUBLIC: 'true' };
    const result = await checkAuth(makeRequest(), env);
    expect(result).toBeUndefined();
  });

  it('returns 403 when no credentials are configured', async () => {
    const env: AuthEnv = {};
    const result = await checkAuth(makeRequest(), env);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(403);
  });

  it('returns 403 when only username is configured', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin' };
    const result = await checkAuth(makeRequest(), env);
    expect(result!.status).toBe(403);
  });

  it('returns 401 when no Authorization header is sent', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest(), env);
    expect(result!.status).toBe(401);
    expect(result!.headers.get('WWW-Authenticate')).toBe('Basic realm="Status Page"');
  });

  it('returns 401 for non-Basic auth header', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest('Bearer token123'), env);
    expect(result!.status).toBe(401);
  });

  it('returns 401 for invalid base64 encoding', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest('Basic !!!invalid!!!'), env);
    expect(result!.status).toBe(401);
  });

  it('returns 401 for credentials without colon separator', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };

    const result = await checkAuth(makeRequest('Basic ' + btoa('nocolon')), env);
    expect(result!.status).toBe(401);
  });

  it('returns 401 for wrong username', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest(encodeBasic('wrong', 'secret')), env);
    expect(result!.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest(encodeBasic('admin', 'wrong')), env);
    expect(result!.status).toBe(401);
  });

  it('allows access with valid credentials', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'secret' };
    const result = await checkAuth(makeRequest(encodeBasic('admin', 'secret')), env);
    expect(result).toBeUndefined();
  });

  it('handles passwords containing colons', async () => {
    const env: AuthEnv = { STATUS_USERNAME: 'admin', STATUS_PASSWORD: 'pass:with:colons' };
    const result = await checkAuth(makeRequest(encodeBasic('admin', 'pass:with:colons')), env);
    expect(result).toBeUndefined();
  });
});
