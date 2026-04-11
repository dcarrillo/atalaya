export function interpolateSecrets<T extends Record<string, unknown>>(
  configYaml: string,
  env: T
): string {
  return configYaml.replaceAll(/\$\{([^\}]+)\}/gv, (match, variableName: string) => {
    const value = env[variableName as keyof T];
    return typeof value === 'string' ? value : match;
  });
}
