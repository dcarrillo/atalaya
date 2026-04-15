import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HttpCheckRequest } from '../types.js';
import { executeHttpCheck } from './http.js';

const createCheckRequest = (overrides: Partial<HttpCheckRequest> = {}): HttpCheckRequest => ({
  name: 'test-http',
  type: 'http',
  target: 'https://example.com',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

describe('executeHttpCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns up status on successful response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest();
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.name).toBe('test-http');
    expect(result.error).toBe('');
    expect(result.attempts).toBe(1);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('returns down status on wrong expected status code', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 201 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Expected status 201, got 200');
  });

  it('matches expected status code when correct', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 201 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
  });

  it('retries on failure and eventually fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toBe('Network error');
    expect(result.attempts).toBe(3);
  });

  it('retries on failure and eventually succeeds', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(''),
      } as unknown as Response);

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });

  it('uses correct HTTP method', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({ method: 'POST' });
    await executeHttpCheck(check);

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('defaults to GET method', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest();
    await executeHttpCheck(check);

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('sends default User-Agent header', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest();
    await executeHttpCheck(check);

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'atalaya-uptime' }),
      })
    );
  });

  it('merges custom headers with defaults', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({
      headers: { Authorization: 'Bearer token123' },
    });
    await executeHttpCheck(check);

    const callHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders['User-Agent']).toBe('atalaya-uptime');
    expect(callHeaders['Authorization']).toBe('Bearer token123');
  });

  it('allows monitor headers to override defaults', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({
      headers: { 'User-Agent': 'custom-agent' },
    });
    await executeHttpCheck(check);

    const callHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders['User-Agent']).toBe('custom-agent');
  });

  it('handles abort signal timeout', async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('The operation was aborted'));
          }, 100);
        })
    );

    const check = createCheckRequest({ timeoutMs: 50, retries: 0 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
  });

  it('retries on wrong status code', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(''),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(''),
      } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 200, retries: 2, retryDelayMs: 10 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });

  it('handles unknown error types', async () => {
    vi.mocked(fetch).mockRejectedValue('string error');

    const check = createCheckRequest({ retries: 0 });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toBe('Unknown error');
  });

  it('returns up when body contains expected content', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Welcome to our site'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedBodyContains: 'Welcome' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.error).toBe('');
  });

  it('returns down when body does not contain expected content', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Error: Not found'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedBodyContains: 'Welcome' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain("Expected body to contain 'Welcome'");
  });

  it('returns up when both status and body match', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue('User created successfully'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 201, expectedBodyContains: 'created' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.error).toBe('');
  });

  it('returns down when status matches but body does not', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue('Error: Invalid input'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 201, expectedBodyContains: 'created' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain("Expected body to contain 'created'");
  });

  it('returns down when body matches but status does not', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('User created successfully'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedStatus: 201, expectedBodyContains: 'created' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Expected status 201, got 200');
  });

  it('returns up when expected body is empty string (no body check)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);

    const check = createCheckRequest({ expectedBodyContains: '' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.error).toBe('');
  });

  it('returns up when expected body is whitespace only (no body check)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Some content'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedBodyContains: '   ' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.error).toBe('');
  });

  it('performs case-sensitive body matching', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('HELLO WORLD'),
    } as unknown as Response);

    const check = createCheckRequest({ expectedBodyContains: 'hello' });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain("Expected body to contain 'hello'");
  });

  it('retries on body mismatch and eventually succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Loading...'),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Ready'),
      } as unknown as Response);

    const check = createCheckRequest({
      expectedBodyContains: 'Ready',
      retries: 2,
      retryDelayMs: 10,
    });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });

  it('retries on body mismatch and eventually fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Error'),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedBodyContains: 'Ready',
      retries: 2,
      retryDelayMs: 10,
    });
    const result = await executeHttpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain("Expected body to contain 'Ready'");
    expect(result.attempts).toBe(3);
  });
});
