import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  HttpCheckRequest,
  TcpCheckRequest,
  DnsCheckRequest,
  CheckResult,
  Env,
} from '../types.js';
import { executeHttpCheck } from '../checks/http.js';
import { executeTcpCheck } from '../checks/tcp.js';
import { executeDnsCheck } from '../checks/dns.js';
import { RegionalChecker } from './checker.js';

// Mock Cloudflare imports
vi.mock('cloudflare:workers', () => ({
  DurableObject: class MockDurableObject {
    ctx: any;
    constructor(ctx: any, _env: any) {
      this.ctx = ctx;
    }
  },
}));

// Mock the check execution functions
vi.mock('../checks/http.js', () => ({
  executeHttpCheck: vi.fn(),
}));

vi.mock('../checks/tcp.js', () => ({
  executeTcpCheck: vi.fn(),
}));

vi.mock('../checks/dns.js', () => ({
  executeDnsCheck: vi.fn(),
}));

const createMockDurableObjectState = () => ({
  blockConcurrencyWhile: vi.fn(),
  getAlarm: vi.fn(),
  setAlarm: vi.fn(),
  deleteAlarm: vi.fn(),
  storage: {
    get: vi.fn(),
    getMany: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    list: vi.fn(),
    transaction: vi.fn(),
  },
  waitUntil: vi.fn(),
});

const createMockEnv = (): Env => ({
  DB: {} as any,
  MONITORS_CONFIG: '',
});

const createHttpCheckRequest = (overrides: Partial<HttpCheckRequest> = {}): HttpCheckRequest => ({
  name: 'test-check',
  type: 'http',
  target: 'https://example.com',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

const createTcpCheckRequest = (overrides: Partial<TcpCheckRequest> = {}): TcpCheckRequest => ({
  name: 'test-check',
  type: 'tcp',
  target: 'example.com:80',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

const createDnsCheckRequest = (overrides: Partial<DnsCheckRequest> = {}): DnsCheckRequest => ({
  name: 'test-check',
  type: 'dns',
  target: 'example.com',
  timeoutMs: 5000,
  retries: 2,
  retryDelayMs: 100,
  ...overrides,
});

describe('RegionalChecker', () => {
  let checker: RegionalChecker;
  let mockState: any;
  let mockEnv: Env;

  beforeEach(() => {
    mockState = createMockDurableObjectState();
    mockEnv = createMockEnv();
    checker = new RegionalChecker(mockState, mockEnv);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runCheck', () => {
    it('executes HTTP check when type is http', async () => {
      const mockResult: CheckResult = {
        name: 'test-check',
        status: 'up',
        responseTimeMs: 100,
        error: '',
        attempts: 1,
      };

      vi.mocked(executeHttpCheck).mockResolvedValue(mockResult);

      const check = createHttpCheckRequest();
      const result = await checker.runCheck(check);

      expect(executeHttpCheck).toHaveBeenCalledWith(check);
      expect(result).toEqual(mockResult);
    });

    it('executes TCP check when type is tcp', async () => {
      const mockResult: CheckResult = {
        name: 'test-check',
        status: 'up',
        responseTimeMs: 50,
        error: '',
        attempts: 1,
      };

      vi.mocked(executeTcpCheck).mockResolvedValue(mockResult);

      const check = createTcpCheckRequest();
      const result = await checker.runCheck(check);

      expect(executeTcpCheck).toHaveBeenCalledWith(check);
      expect(result).toEqual(mockResult);
    });

    it('executes DNS check when type is dns', async () => {
      const mockResult: CheckResult = {
        name: 'test-check',
        status: 'up',
        responseTimeMs: 30,
        error: '',
        attempts: 1,
      };

      vi.mocked(executeDnsCheck).mockResolvedValue(mockResult);

      const check = createDnsCheckRequest();
      const result = await checker.runCheck(check);

      expect(executeDnsCheck).toHaveBeenCalledWith(check);
      expect(result).toEqual(mockResult);
    });

    it('returns down status with error when check execution throws', async () => {
      const error = new Error('Network error');
      vi.mocked(executeHttpCheck).mockRejectedValue(error);

      const check = createHttpCheckRequest();
      const result = await checker.runCheck(check);

      expect(result).toEqual({
        name: 'test-check',
        status: 'down',
        responseTimeMs: 0,
        error: 'Network error',
        attempts: 1,
      });
    });

    it('handles unknown error types gracefully', async () => {
      vi.mocked(executeHttpCheck).mockRejectedValue('string error');

      const check = createHttpCheckRequest();
      const result = await checker.runCheck(check);

      expect(result).toEqual({
        name: 'test-check',
        status: 'down',
        responseTimeMs: 0,
        error: 'Unknown error',
        attempts: 1,
      });
    });
  });

  describe('kill', () => {
    it('calls blockConcurrencyWhile with function that do not throws', async () => {
      let thrownError: Error | undefined;
      mockState.blockConcurrencyWhile.mockImplementation(async (fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (error) {
          thrownError = error as Error;
        }
      });

      await checker.kill();

      expect(thrownError!);
    });
  });
});
