import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interpolateSecrets } from './utils/interpolate.js';

// Mock Cloudflare-specific modules that can't be resolved in Node.js
vi.mock('cloudflare:sockets', () => ({
  connect: vi.fn(),
}));

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
}));

// Mock the auth module
vi.mock('./lib/auth.js', () => ({
  checkAuth: vi.fn().mockResolvedValue(undefined),
}));

// Mock the Astro SSR app (build artifact won't exist during tests)
const astroFetchMock = vi.fn().mockResolvedValue(new Response('<html>OK</html>', { status: 200 }));
vi.mock('../status-page/dist/server/index.mjs', () => ({
  default: {
    fetch: astroFetchMock,
  },
}));

// Mock caches API
const mockCaches = {
  default: {
    match: vi.fn(),
    put: vi.fn(),
  },
};

// @ts-expect-error - Adding caches to global for testing
global.caches = mockCaches;

describe('worker fetch handler', () => {
  async function getWorker() {
    const mod = await import('./index.js');
    return mod.default;
  }

  const mockEnv = {
    DB: {},
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })),
    },
  } as any;

  const mockCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: vi.fn(),
  } as unknown as ExecutionContext;

  it('should delegate to Astro SSR for GET /', async () => {
    const worker = await getWorker();
    const request = new Request('https://example.com/');
    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(response.status).toBe(200);
  });

  it('should return 401 when auth fails', async () => {
    const { checkAuth } = await import('./lib/auth.js');
    vi.mocked(checkAuth).mockResolvedValueOnce(
      new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Status Page"' },
      })
    );

    const worker = await getWorker();
    const request = new Request('https://example.com/');
    const response = await worker.fetch(request, mockEnv, mockCtx);

    expect(response.status).toBe(401);
  });

  describe('caching', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCaches.default.match.mockReset();
      mockCaches.default.put.mockReset();
    });

    it('should cache response when STATUS_PUBLIC is true', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/');
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // First request - cache miss
      mockCaches.default.match.mockResolvedValueOnce(null);

      const response = await worker.fetch(request, envWithPublic, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(mockCaches.default.match).toHaveBeenCalledTimes(1);
      expect(mockCaches.default.put).toHaveBeenCalledTimes(1);
    });

    it('should return cached response when available', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/');
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // Cache hit
      const cachedResponse = new Response('<html>Cached</html>', {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
      mockCaches.default.match.mockResolvedValueOnce(cachedResponse);

      const response = await worker.fetch(request, envWithPublic, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
      expect(mockCaches.default.match).toHaveBeenCalledTimes(1);
      expect(mockCaches.default.put).not.toHaveBeenCalled();
    });

    it('should not cache when STATUS_PUBLIC is not true', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/');
      const envWithoutPublic = { ...mockEnv, STATUS_PUBLIC: 'false' };

      const response = await worker.fetch(request, envWithoutPublic, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(mockCaches.default.match).not.toHaveBeenCalled();
      expect(mockCaches.default.put).not.toHaveBeenCalled();
    });

    it('should not cache when STATUS_PUBLIC is undefined', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/');
      const envWithoutPublic = { ...mockEnv };
      delete envWithoutPublic.STATUS_PUBLIC;

      const response = await worker.fetch(request, envWithoutPublic, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(mockCaches.default.match).not.toHaveBeenCalled();
      expect(mockCaches.default.put).not.toHaveBeenCalled();
    });

    it('should not cache non-GET requests', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/', { method: 'POST' });
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      const response = await worker.fetch(request, envWithPublic, mockCtx);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(mockCaches.default.match).not.toHaveBeenCalled();
      expect(mockCaches.default.put).not.toHaveBeenCalled();
    });

    it('should not cache error responses', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/');
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // Mock Astro to return error
      astroFetchMock.mockResolvedValueOnce(new Response('Error', { status: 500 }));

      // First request - cache miss
      mockCaches.default.match.mockResolvedValueOnce(null);

      const response = await worker.fetch(request, envWithPublic, mockCtx);

      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(mockCaches.default.match).toHaveBeenCalledTimes(1);
      expect(mockCaches.default.put).not.toHaveBeenCalled();

      // Reset mock for other tests
      astroFetchMock.mockResolvedValue(new Response('<html>OK</html>', { status: 200 }));
    });

    it('should normalize cache key by removing query parameters', async () => {
      const worker = await getWorker();
      const request1 = new Request('https://example.com/?t=1234567890');
      const request2 = new Request('https://example.com/?cache=bust&v=2.0');
      const request3 = new Request('https://example.com/');
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // First request with query params - cache miss
      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(request1, envWithPublic, mockCtx);

      // Get the cache key that was used
      const cacheKey1 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey1.url).toBe('https://example.com/');

      // Reset mock for second request
      mockCaches.default.match.mockReset();
      mockCaches.default.put.mockReset();

      // Second request with different query params - should use same normalized cache key
      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(request2, envWithPublic, mockCtx);

      const cacheKey2 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey2.url).toBe('https://example.com/');

      // Reset mock for third request
      mockCaches.default.match.mockReset();
      mockCaches.default.put.mockReset();

      // Third request without query params - should use same normalized cache key
      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(request3, envWithPublic, mockCtx);

      const cacheKey3 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey3.url).toBe('https://example.com/');
    });

    it('should normalize cache key by removing hash fragment', async () => {
      const worker = await getWorker();
      const request = new Request('https://example.com/#section1');
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(request, envWithPublic, mockCtx);

      const cacheKey = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey.url).toBe('https://example.com/');
    });

    it('should use normalized headers in cache key (ignore cookies)', async () => {
      const worker = await getWorker();

      // Request with cookies
      const requestWithCookies = new Request('https://example.com/', {
        headers: {
          Cookie: 'session=abc123; user=john',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      // Request without cookies
      const requestWithoutCookies = new Request('https://example.com/', {
        headers: {
          'User-Agent': 'Different-Browser',
        },
      });

      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // First request with cookies
      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(requestWithCookies, envWithPublic, mockCtx);

      const cacheKey1 = mockCaches.default.match.mock.calls[0][0];
      // Should not have Cookie header in cache key
      expect(cacheKey1.headers.get('Cookie')).toBeNull();

      // Reset mock for second request
      mockCaches.default.match.mockReset();
      mockCaches.default.put.mockReset();

      // Second request without cookies - should use same cache key
      mockCaches.default.match.mockResolvedValueOnce(null);
      await worker.fetch(requestWithoutCookies, envWithPublic, mockCtx);

      const cacheKey2 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey2.headers.get('Cookie')).toBeNull();
    });

    it('should cache hit for same normalized URL regardless of query params', async () => {
      const worker = await getWorker();
      const envWithPublic = { ...mockEnv, STATUS_PUBLIC: 'true' };

      // First request with query params
      const request1 = new Request('https://example.com/?cache=bust');
      const cachedResponse = new Response('<html>Cached</html>', {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=60' },
      });

      // Cache hit for normalized URL
      mockCaches.default.match.mockResolvedValueOnce(cachedResponse);

      const response1 = await worker.fetch(request1, envWithPublic, mockCtx);
      expect(response1.status).toBe(200);
      expect(mockCaches.default.match).toHaveBeenCalledTimes(1);

      // Get the cache key that was used
      const cacheKey1 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey1.url).toBe('https://example.com/');

      // Reset mock
      mockCaches.default.match.mockReset();

      // Second request with different query params - should also be cache hit
      const request2 = new Request('https://example.com/?t=123456');
      mockCaches.default.match.mockResolvedValueOnce(cachedResponse);

      const response2 = await worker.fetch(request2, envWithPublic, mockCtx);
      expect(response2.status).toBe(200);
      expect(mockCaches.default.match).toHaveBeenCalledTimes(1);

      const cacheKey2 = mockCaches.default.match.mock.calls[0][0];
      expect(cacheKey2.url).toBe('https://example.com/');
    });
  });
});

describe('interpolateSecrets', () => {
  it('should interpolate any secret from env object', () => {
    const configYaml = 'auth: ${MY_SECRET}';
    const env = {
      MY_SECRET: 'secret123',
    };

    const result = interpolateSecrets(configYaml, env);
    expect(result).toBe('auth: secret123');
  });

  it('should handle multiple interpolations', () => {
    const configYaml = `
      auth: \${API_KEY}
      url: \${API_URL}
      token: \${ACCESS_TOKEN}
    `;
    const env = {
      API_KEY: 'key123',
      API_URL: 'https://api.example.com',
      ACCESS_TOKEN: 'token456',
    };

    const result = interpolateSecrets(configYaml, env);
    expect(result).toContain('auth: key123');
    expect(result).toContain('url: https://api.example.com');
    expect(result).toContain('token: token456');
  });

  it('should leave unmatched variables as-is', () => {
    const configYaml = 'auth: ${UNKNOWN_SECRET}';
    const env = {
      MY_SECRET: 'secret123',
    };

    const result = interpolateSecrets(configYaml, env);

    expect(result).toBe('auth: ${UNKNOWN_SECRET}');
  });

  it('should handle empty env values', () => {
    const configYaml = 'auth: ${EMPTY_SECRET}';
    const env = {
      EMPTY_SECRET: '',
    };

    const result = interpolateSecrets(configYaml, env);
    expect(result).toBe('auth: ');
  });

  it('should handle undefined env values', () => {
    const configYaml = 'auth: ${UNDEFINED_SECRET}';
    const env = {
      // No UNDEFINED_SECRET key
    };

    const result = interpolateSecrets(configYaml, env);

    expect(result).toBe('auth: ${UNDEFINED_SECRET}');
  });

  it('should handle complex YAML with mixed content', () => {
    const configYaml = `
      monitors:
        - name: API Check
          type: http
          url: \${API_URL}/health
          headers:
            Authorization: Bearer \${API_TOKEN}
          expectedStatus: 200
      notifications:
        - type: webhook
          url: \${WEBHOOK_URL}
          auth: \${WEBHOOK_AUTH}
    `;
    const env = {
      API_URL: 'https://api.example.com',
      API_TOKEN: 'token123',
      WEBHOOK_URL: 'https://hooks.example.com',
      WEBHOOK_AUTH: 'basic auth',
    };

    const result = interpolateSecrets(configYaml, env);
    expect(result).toContain('url: https://api.example.com/health');
    expect(result).toContain('Authorization: Bearer token123');
    expect(result).toContain('url: https://hooks.example.com');
    expect(result).toContain('auth: basic auth');
  });

  it('should handle special characters in variable names', () => {
    const configYaml = 'auth: ${MY-SECRET_KEY}';
    const env = {
      'MY-SECRET_KEY': 'value123',
    };

    const result = interpolateSecrets(configYaml, env);
    expect(result).toBe('auth: value123');
  });
});
