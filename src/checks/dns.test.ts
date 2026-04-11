import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DnsCheckRequest } from '../types.js';
import { executeDnsCheck } from './dns.js';

const createCheckRequest = (overrides: Partial<DnsCheckRequest> = {}): DnsCheckRequest => ({
  name: 'test-dns',
  type: 'dns',
  target: 'example.com',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

describe('executeDnsCheck', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns up status on successful DNS resolution', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as unknown as Response);

    const check = createCheckRequest();
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
    expect(result.name).toBe('test-dns');
    expect(result.error).toBe('');
    expect(result.attempts).toBe(1);
  });

  it('uses correct DoH URL with record type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: 'mx.example.com' }] }),
    } as unknown as Response);

    const check = createCheckRequest({ recordType: 'MX' });
    await executeDnsCheck(check);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('type=MX'), expect.any(Object));
  });

  it('defaults to A record type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as unknown as Response);

    const check = createCheckRequest();
    await executeDnsCheck(check);

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('type=A'), expect.any(Object));
  });

  it('returns down status when DNS query fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    const check = createCheckRequest({ retries: 0 });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('DNS query failed');
  });

  it('validates expected values', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34'],
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
  });

  it('returns down status when expected values do not match', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '1.2.3.4' }] }),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34'],
      retries: 0,
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Expected 93.184.216.34');
  });

  it('validates multiple expected values', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        Answer: [{ data: '93.184.216.34' }, { data: '93.184.216.35' }],
      }),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34', '93.184.216.35'],
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
  });

  it('fails when not all expected values are found', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34', '93.184.216.35'],
      retries: 0,
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
  });

  it('retries on failure and eventually succeeds', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
      } as unknown as Response);

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });

  it('retries on failure and eventually fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toBe('Network error');
    expect(result.attempts).toBe(3);
  });

  it('handles empty Answer array', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [] }),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34'],
      retries: 0,
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
  });

  it('handles missing Answer field', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34'],
      retries: 0,
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
  });

  it('passes when no expected values specified', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as unknown as Response);

    const check = createCheckRequest({ expectedValues: undefined });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
  });

  it('handles unknown error types', async () => {
    vi.mocked(fetch).mockRejectedValue('string error');

    const check = createCheckRequest({ retries: 0 });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toBe('Unknown error');
  });

  it('encodes target in URL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
    } as unknown as Response);

    const check = createCheckRequest({ target: 'sub.example.com' });
    await executeDnsCheck(check);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('name=sub.example.com'),
      expect.any(Object)
    );
  });

  it('retries on wrong expected values then succeeds', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Answer: [{ data: 'wrong' }] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Answer: [{ data: '93.184.216.34' }] }),
      } as unknown as Response);

    const check = createCheckRequest({
      expectedValues: ['93.184.216.34'],
      retries: 2,
      retryDelayMs: 10,
    });
    const result = await executeDnsCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });
});
