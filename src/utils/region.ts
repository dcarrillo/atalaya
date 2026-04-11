/**
 * Get the current Cloudflare worker location (colo)
 * @returns Promise<string> The Cloudflare colo location
 */
export async function getWorkerLocation(): Promise<string> {
  try {
    const response = await fetch('https://cloudflare.com/cdn-cgi/trace');
    const text = await response.text();

    // Parse the trace response to find colo
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('colo=')) {
        return line.split('=')[1];
      }
    }

    return 'unknown';
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'worker_location_error',
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return 'error';
  }
}

/**
 * Validate if a region code is a valid Cloudflare region
 * @param region The region code to validate
 * @returns boolean True if valid
 */
export function isValidRegion(region: string): boolean {
  // Common Cloudflare region codes
  const validRegions = [
    'weur', // Western Europe
    'enam', // Eastern North America
    'wnam', // Western North America
    'apac', // Asia Pacific
    'eeur', // Eastern Europe
    'oc', // Oceania
    'safr', // South Africa
    'me', // Middle East
    'sam', // South America
  ];

  return validRegions.includes(region.toLowerCase());
}

/**
 * Get a list of valid Cloudflare region codes
 * @returns string[] Array of valid region codes
 */
export function getValidRegions(): string[] {
  return [
    'weur', // Western Europe
    'enam', // Eastern North America
    'wnam', // Western North America
    'apac', // Asia Pacific
    'eeur', // Eastern Europe
    'oc', // Oceania
    'safr', // South Africa
    'me', // Middle East
    'sam', // South America
  ];
}
