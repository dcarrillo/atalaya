const PRIVATE_IP_PREFIXES = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '100.64.',
  '100.65.',
  '100.66.',
  '100.67.',
  '100.68.',
  '100.69.',
  '100.70.',
  '100.71.',
  '100.72.',
  '100.73.',
  '100.74.',
  '100.75.',
  '100.76.',
  '100.77.',
  '100.78.',
  '100.79.',
  '100.80.',
  '100.81.',
  '100.82.',
  '100.83.',
  '100.84.',
  '100.85.',
  '100.86.',
  '100.87.',
  '100.88.',
  '100.89.',
  '100.90.',
  '100.91.',
  '100.92.',
  '100.93.',
  '100.94.',
  '100.95.',
  '100.96.',
  '100.97.',
  '100.98.',
  '100.99.',
  '100.100.',
  '100.101.',
  '100.102.',
  '100.103.',
  '100.104.',
  '100.105.',
  '100.106.',
  '100.107.',
  '100.108.',
  '100.109.',
  '100.110.',
  '100.111.',
  '100.112.',
  '100.113.',
  '100.114.',
  '100.115.',
  '100.116.',
  '100.117.',
  '100.118.',
  '100.119.',
  '100.120.',
  '100.121.',
  '100.122.',
  '100.123.',
  '100.124.',
  '100.125.',
  '100.126.',
  '100.127.',
];

const RESERVED_IP_PREFIXES = [
  '0.',
  '127.',
  '169.254.',
  '198.18.',
  '198.51.100.',
  '203.0.113.',
  '192.0.2.',
  '255.',
];

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function ipMatchesAnyPrefix(ip: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (ip.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

export function isBlockedURL(urlString: string): string | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return 'Invalid URL';
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return `Blocked protocol: ${protocol}`;
  }

  const hostname = url.hostname.toLowerCase();

  const strippedHostname = hostname.replaceAll(/^\[|\]$/gv, '');

  if (LOCALHOST_NAMES.has(hostname) || LOCALHOST_NAMES.has(strippedHostname)) {
    return `Blocked: localhost / loopback address`;
  }

  if (strippedHostname.endsWith('.local') || strippedHostname.endsWith('.localhost')) {
    return `Blocked: localhost / loopback address`;
  }

  if (strippedHostname === '::1' || strippedHostname === '0:0:0:0:0:0:0:1') {
    return 'Blocked: IPv6 loopback address';
  }

  // Check for bare IPv4 addresses against private/reserved ranges
  if (hostname.includes('.')) {
    if (ipMatchesAnyPrefix(hostname, PRIVATE_IP_PREFIXES)) {
      return `Blocked: private IP address (${hostname})`;
    }
    if (ipMatchesAnyPrefix(hostname, RESERVED_IP_PREFIXES)) {
      return `Blocked: reserved IP address (${hostname})`;
    }
  }

  return null;
}
