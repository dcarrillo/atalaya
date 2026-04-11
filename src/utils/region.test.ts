import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getWorkerLocation, isValidRegion, getValidRegions } from './region.js';

describe('region utilities', () => {
  describe('getWorkerLocation', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns colo location from Cloudflare trace', async () => {
      const mockTrace = 'colo=weur\nip=1.2.3.4\ntls=TLSv1.3';
      vi.mocked(fetch).mockResolvedValue({
        text: async () => mockTrace,
      } as Response);

      const location = await getWorkerLocation();
      expect(location).toBe('weur');
      expect(fetch).toHaveBeenCalledWith('https://cloudflare.com/cdn-cgi/trace');
    });

    it('returns unknown when colo not found in trace', async () => {
      const mockTrace = 'ip=1.2.3.4\ntls=TLSv1.3';
      vi.mocked(fetch).mockResolvedValue({
        text: async () => mockTrace,
      } as Response);

      const location = await getWorkerLocation();
      expect(location).toBe('unknown');
    });

    it('returns error when fetch fails', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      const location = await getWorkerLocation();
      expect(location).toBe('error');
    });

    it('handles empty response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        text: async () => '',
      } as Response);

      const location = await getWorkerLocation();
      expect(location).toBe('unknown');
    });
  });

  describe('isValidRegion', () => {
    it('returns true for valid region codes', () => {
      expect(isValidRegion('weur')).toBe(true);
      expect(isValidRegion('enam')).toBe(true);
      expect(isValidRegion('wnam')).toBe(true);
      expect(isValidRegion('apac')).toBe(true);
      expect(isValidRegion('eeur')).toBe(true);
      expect(isValidRegion('oc')).toBe(true);
      expect(isValidRegion('safr')).toBe(true);
      expect(isValidRegion('me')).toBe(true);
      expect(isValidRegion('sam')).toBe(true);
    });

    it('returns true for valid region codes in uppercase', () => {
      expect(isValidRegion('WEUR')).toBe(true);
      expect(isValidRegion('ENAM')).toBe(true);
    });

    it('returns false for invalid region codes', () => {
      expect(isValidRegion('invalid')).toBe(false);
      expect(isValidRegion('')).toBe(false);
      expect(isValidRegion('us-east')).toBe(false);
      expect(isValidRegion('eu-west')).toBe(false);
    });

    it('handles mixed case region codes', () => {
      expect(isValidRegion('WeUr')).toBe(true);
      expect(isValidRegion('EnAm')).toBe(true);
    });
  });

  describe('getValidRegions', () => {
    it('returns array of valid region codes', () => {
      const regions = getValidRegions();
      expect(Array.isArray(regions)).toBe(true);
      expect(regions).toHaveLength(9);
      expect(regions).toContain('weur');
      expect(regions).toContain('enam');
      expect(regions).toContain('wnam');
      expect(regions).toContain('apac');
      expect(regions).toContain('eeur');
      expect(regions).toContain('oc');
      expect(regions).toContain('safr');
      expect(regions).toContain('me');
      expect(regions).toContain('sam');
    });
  });
});
