import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connect } from 'cloudflare:sockets';
import type { TcpCheckRequest } from '../types.js';
import { executeTcpCheck } from './tcp.js';

type Socket = ReturnType<typeof connect>;

vi.mock('cloudflare:sockets', () => ({
  connect: vi.fn(),
}));

const createCheckRequest = (overrides: Partial<TcpCheckRequest> = {}): TcpCheckRequest => ({
  name: 'test-tcp',
  type: 'tcp',
  target: 'example.com:443',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

type MockSocket = {
  opened: Promise<unknown>;
  close: ReturnType<typeof vi.fn>;
};

function createMockSocket(options: { shouldOpen?: boolean; openDelay?: number } = {}): MockSocket {
  const { shouldOpen = true, openDelay = 0 } = options;

  const mockClose = vi.fn().mockResolvedValue(undefined);
  let mockOpened: Promise<unknown>;
  if (shouldOpen) {
    mockOpened = new Promise(resolve => {
      setTimeout(resolve, openDelay);
    });
  } else {
    mockOpened = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Connection refused'));
      }, openDelay);
    });
  }

  return {
    opened: mockOpened,
    close: mockClose,
  };
}

describe('executeTcpCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns down status for invalid target format', async () => {
    const check = createCheckRequest({ target: 'invalid-target' });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Invalid target format');
    expect(result.attempts).toBe(1);
  });

  it('returns down status for invalid port number (NaN)', async () => {
    const check = createCheckRequest({ target: 'example.com:abc' });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Invalid port number');
  });

  it('returns down status for port out of range (0)', async () => {
    const check = createCheckRequest({ target: 'example.com:0' });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Invalid port number');
  });

  it('returns down status for port out of range (65536)', async () => {
    const check = createCheckRequest({ target: 'example.com:65536' });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Invalid port number');
  });

  it('returns up status on successful connection', async () => {
    vi.mocked(connect).mockReturnValue(createMockSocket() as unknown as Socket);

    const check = createCheckRequest();
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('up');
    expect(result.name).toBe('test-tcp');
    expect(result.error).toBe('');
    expect(result.attempts).toBe(1);
    expect(connect).toHaveBeenCalledWith({ hostname: 'example.com', port: 443 });
  });

  it('returns down status on connection failure', async () => {
    vi.mocked(connect).mockReturnValue(
      createMockSocket({ shouldOpen: false }) as unknown as Socket
    );

    const check = createCheckRequest({ retries: 0 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('Connection refused');
  });

  it('retries on failure and eventually succeeds', async () => {
    vi.mocked(connect)
      .mockReturnValueOnce(createMockSocket({ shouldOpen: false }) as unknown as Socket)
      .mockReturnValueOnce(createMockSocket({ shouldOpen: true }) as unknown as Socket);

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('up');
    expect(result.attempts).toBe(2);
  });

  it('retries on failure and eventually fails', async () => {
    vi.mocked(connect).mockReturnValue(
      createMockSocket({ shouldOpen: false }) as unknown as Socket
    );

    const check = createCheckRequest({ retries: 2, retryDelayMs: 10 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.attempts).toBe(3);
  });

  it('handles connection timeout', async () => {
    vi.mocked(connect).mockReturnValue({
      opened: new Promise(() => {
        // Never resolves
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Socket);

    const check = createCheckRequest({ timeoutMs: 50, retries: 0 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toContain('timeout');
  });

  it('closes socket after successful connection', async () => {
    const mockSocket = createMockSocket();
    vi.mocked(connect).mockReturnValue(mockSocket as unknown as Socket);

    const check = createCheckRequest();
    await executeTcpCheck(check);

    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('handles socket close error gracefully in finally block', async () => {
    const mockSocket = {
      opened: Promise.reject(new Error('Connection failed')),
      close: vi.fn().mockRejectedValue(new Error('Close error')),
    };
    vi.mocked(connect).mockReturnValue(mockSocket as unknown as Socket);

    const check = createCheckRequest({ retries: 0 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it('handles unknown error types', async () => {
    vi.mocked(connect).mockReturnValue({
      opened: Promise.reject(new Error('string error')),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Socket);

    const check = createCheckRequest({ retries: 0 });
    const result = await executeTcpCheck(check);

    expect(result.status).toBe('down');
    expect(result.error).toBe('string error');
  });

  it('parses port correctly', async () => {
    vi.mocked(connect).mockReturnValue(createMockSocket() as unknown as Socket);

    const check = createCheckRequest({ target: 'db.example.com:5432' });
    await executeTcpCheck(check);

    expect(connect).toHaveBeenCalledWith({ hostname: 'db.example.com', port: 5432 });
  });
});
