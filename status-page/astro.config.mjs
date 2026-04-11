import {defineConfig} from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Workaround for Astro 6.1 + @astrojs/cloudflare 13.1 build bug.
// Astro's static-build.js creates the SSR environment config with only
// rollupOptions.output, dropping the rollupOptions.input that
// @cloudflare/vite-plugin sets.  This plugin restores the input via
// configEnvironment (which runs after all config merging).
// TODO: remove once fixed upstream in @astrojs/cloudflare or astro.
function fixBuildRollupInput() {
	return {
		name: 'fix-build-rollup-input',
		enforce: 'post',
		configEnvironment(name, options) {
			if (name === 'ssr' && !options.build?.rollupOptions?.input) {
				return {
					build: {
						rollupOptions: {
							input: {index: 'virtual:cloudflare/worker-entry'},
						},
					},
				};
			}
		},
	};
}

export default defineConfig({
	output: 'server',
	adapter: cloudflare({prerenderEnvironment: 'node'}),
	vite: {
		plugins: [fixBuildRollupInput()],
		optimizeDeps: {
			exclude: ['cookie'],
		},
		environments: {
			ssr: {
				optimizeDeps: {
					exclude: ['cookie'],
				},
			},
		},
	},
});
