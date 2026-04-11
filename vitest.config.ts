import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'mock-astro-ssr',
      resolveId(id: string) {
        // Allow vi.mock to intercept the Astro SSR build artifact that doesn't exist during tests
        if (id.includes('status-page/dist/_worker.js/index.js')) {
          return id;
        }

        return null;
      },
    },
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
