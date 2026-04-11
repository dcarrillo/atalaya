import { describe, it, expect } from 'vitest';
import { interpolateSecrets } from './utils/interpolate.js';
import { parseConfig } from './config/index.js';

describe('integration: secret interpolation with config parsing', () => {
  it('should parse config with interpolated secret', () => {
    const configYaml = `
alerts:
  - name: "ntfy"
    type: webhook
    url: "https://example.com"
    method: POST
    headers:
      Authorization: "Basic \${BASIC_AUTH}"
      Content-Type: application/json
    body_template: "test"

monitors:
  - name: "test"
    type: http
    target: "https://example.com"
`;

    const env = {
      DB: {} as any,
      MONITORS_CONFIG: '',
      BASIC_AUTH: 'dXNlcjpwYXNz',
    };

    const interpolated = interpolateSecrets(configYaml, env as any);
    const config = parseConfig(interpolated);

    expect(config.alerts).toHaveLength(1);
    expect(config.alerts[0].headers.Authorization).toBe('Basic dXNlcjpwYXNz');
    expect(config.monitors).toHaveLength(1);
  });

  it('should handle config without secrets', () => {
    const configYaml = `
alerts:
  - name: "simple"
    type: webhook
    url: "https://example.com"
    method: POST
    headers: {}
    body_template: "test"

monitors: []
`;

    const env = {
      DB: {} as any,
      MONITORS_CONFIG: '',
    };

    const interpolated = interpolateSecrets(configYaml, env as any);
    const config = parseConfig(interpolated);

    expect(config.alerts).toHaveLength(1);
    expect(config.monitors).toHaveLength(0);
  });
});
