import { describe, it, expect } from 'vitest';
import { isBlockedURL } from './ssrf.js';

describe('isBlockedURL', () => {
  describe('valid public URLs', () => {
    it('allows standard https URLs', () => {
      expect(isBlockedURL('https://example.com')).toBeNull();
    });

    it('allows standard http URLs', () => {
      expect(isBlockedURL('http://example.com')).toBeNull();
    });

    it('allows URLs with paths', () => {
      expect(isBlockedURL('https://api.example.com/v1/health')).toBeNull();
    });

    it('allows URLs with ports', () => {
      expect(isBlockedURL('https://api.example.com:8080/health')).toBeNull();
    });

    it('allows subdomains', () => {
      expect(isBlockedURL('https://monitoring.example.com')).toBeNull();
    });

    it('allows public IP addresses', () => {
      expect(isBlockedURL('https://8.8.8.8')).toBeNull();
    });

    it('allows public IP addresses on common ranges', () => {
      expect(isBlockedURL('https://93.184.216.34')).toBeNull();
    });
  });

  describe('localhost blocking', () => {
    it('blocks localhost hostname', () => {
      const result = isBlockedURL('http://localhost');
      expect(result).toContain('Blocked');
    });

    it('blocks localhost with port', () => {
      const result = isBlockedURL('http://localhost:8080/health');
      expect(result).toContain('Blocked');
    });

    it('blocks 127.0.0.1', () => {
      const result = isBlockedURL('http://127.0.0.1');
      expect(result).toContain('Blocked');
    });

    it('blocks 127.0.0.1 with path', () => {
      const result = isBlockedURL('http://127.0.0.1/api/health');
      expect(result).toContain('Blocked');
    });

    it('blocks 0.0.0.0', () => {
      const result = isBlockedURL('http://0.0.0.0');
      expect(result).toContain('Blocked');
    });

    it('blocks ::1 IPv6 loopback', () => {
      const result = isBlockedURL('http://[::1]');
      expect(result).toContain('Blocked');
    });
  });

  describe('RFC 1918 private IPs', () => {
    it('blocks 10.x.x.x', () => {
      expect(isBlockedURL('http://10.0.0.1')).toContain('Blocked');
      expect(isBlockedURL('http://10.255.255.255')).toContain('Blocked');
    });

    it('blocks 172.16-31.x.x', () => {
      expect(isBlockedURL('http://172.16.0.1')).toContain('Blocked');
      expect(isBlockedURL('http://172.31.255.255')).toContain('Blocked');
    });

    it('blocks 192.168.x.x', () => {
      expect(isBlockedURL('http://192.168.0.1')).toContain('Blocked');
      expect(isBlockedURL('http://192.168.255.255')).toContain('Blocked');
    });

    it('does not block 172.32.x.x (public range)', () => {
      expect(isBlockedURL('http://172.32.0.1')).toBeNull();
    });
  });

  describe('RFC 6598 Carrier-grade NAT', () => {
    it('blocks 100.64.x.x through 100.127.x.x', () => {
      expect(isBlockedURL('http://100.64.0.1')).toContain('Blocked');
      expect(isBlockedURL('http://100.127.255.255')).toContain('Blocked');
      expect(isBlockedURL('http://100.127.0.1')).toContain('Blocked');
    });

    it('does not block 100.63.x.x (public)', () => {
      expect(isBlockedURL('http://100.63.0.1')).toBeNull();
    });

    it('does not block 100.128.x.x (public)', () => {
      expect(isBlockedURL('http://100.128.0.1')).toBeNull();
    });
  });

  describe('reserved IPs', () => {
    it('blocks 0.x.x.x', () => {
      expect(isBlockedURL('http://0.0.0.1')).toContain('Blocked');
    });

    it('blocks 127.x.x.x (not just 127.0.0.1)', () => {
      expect(isBlockedURL('http://127.1.2.3')).toContain('Blocked');
      expect(isBlockedURL('http://127.255.255.255')).toContain('Blocked');
    });

    it('blocks 169.254.x.x (link-local)', () => {
      expect(isBlockedURL('http://169.254.1.1')).toContain('Blocked');
    });

    it('blocks 255.x.x.x (broadcast)', () => {
      expect(isBlockedURL('http://255.255.255.255')).toContain('Blocked');
    });
  });

  describe('.local and .localhost TLDs', () => {
    it('blocks .local hostnames', () => {
      expect(isBlockedURL('http://my-service.local')).toContain('Blocked');
    });

    it('blocks .localhost hostnames', () => {
      expect(isBlockedURL('http://app.localhost')).toContain('Blocked');
    });

    it('does not block .local in path', () => {
      expect(isBlockedURL('https://example.com/local')).toBeNull();
    });
  });

  describe('protocol blocking', () => {
    it('blocks file:// URLs', () => {
      const result = isBlockedURL('file:///etc/passwd');
      expect(result).toContain('Blocked protocol');
    });

    it('blocks ftp:// URLs', () => {
      const result = isBlockedURL('ftp://ftp.example.com');
      expect(result).toContain('Blocked protocol');
    });

    it('blocks data: URLs', () => {
      const result = isBlockedURL('data:text/plain,hello');
      expect(result).toContain('Blocked protocol');
    });
  });

  describe('edge cases', () => {
    it('rejects empty string', () => {
      expect(isBlockedURL('')).toContain('Invalid URL');
    });

    it('rejects garbage input', () => {
      expect(isBlockedURL('not a url')).toContain('Invalid URL');
    });

    it('blocks private IP via HTTPS', () => {
      expect(isBlockedURL('https://192.168.1.1')).toContain('Blocked');
    });

    it('does not block hostnames that might resolve to private IPs', () => {
      // We only block by hostname if it's an explicit IP or localhost keyword
      expect(isBlockedURL('http://internal.service')).toBeNull();
    });

    it('blocks 10.0.0.0 exact', () => {
      expect(isBlockedURL('http://10.0.0.0')).toContain('Blocked');
    });
  });
});
