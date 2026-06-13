/**
 * SSRF guard for user-supplied URLs prior to any server-side fetch.
 *
 * Protections:
 *   - Protocol allowlist: http:, https:
 *   - No userinfo (`https://user:pass@host`)
 *   - Reject literal IP hostnames in blocked ranges (loopback, RFC 1918,
 *     link-local, cloud metadata, IPv6 unique-local / link-local / loopback)
 *   - Reject the bare hostname "localhost"
 *   - DNS-resolve at request time and reject if ANY returned address is
 *     blocked. Resolving at request time (not parse time) defends against
 *     DNS rebinding attacks; callers should pin the resolved address for
 *     the actual fetch where possible.
 *
 * The resolver is injected so unit tests can simulate rebinding and
 * multi-A-record responses without touching real DNS.
 *
 * Callers MUST re-validate after every redirect hop — a redirect can move
 * from a public host to an internal one.
 */

export type UnsafeReason =
  | 'invalid-url'
  | 'url-too-long'
  | 'protocol-not-allowed'
  | 'userinfo-not-allowed'
  | 'blocked-hostname'
  | 'blocked-ip'
  | 'dns-failure';

export class UnsafeFetchUrlError extends Error {
  readonly reason: UnsafeReason;
  constructor(reason: UnsafeReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'UnsafeFetchUrlError';
    this.reason = reason;
  }
}

export interface AddressResolver {
  /** Return one or more IP addresses (IPv4 or IPv6) for the hostname. */
  resolve(hostname: string): Promise<string[]>;
}

export interface AssertSafeFetchUrlOptions {
  resolver?: AddressResolver;
}

const MAX_URL_LENGTH = 2000;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTNAMES = new Set(['localhost']);

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const match = IPV4_RE.exec(ip);
  if (!match) return null;
  const octets = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ] as [number, number, number, number];
  for (const o of octets) {
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
  }
  return octets;
}

function isBlockedIpv4(ip: string): boolean {
  const octets = parseIpv4Octets(ip);
  if (!octets) return false;
  const [a, b] = octets;
  // 0.0.0.0/8 — unspecified / "this network"
  if (a === 0) return true;
  // 10.0.0.0/8 — RFC 1918 private
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local + cloud metadata (169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — RFC 1918 private (172.16.0.0 — 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — RFC 1918 private
  if (a === 192 && b === 168) return true;
  // 224.0.0.0/4 — multicast
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 — reserved
  if (a >= 240) return true;
  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function normaliseIpv6(ip: string): string {
  return ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function expandIpv6(ip: string): string[] | null {
  const normalised = normaliseIpv6(ip);
  if (!/^[0-9a-f:]+$/.test(normalised)) return null;
  const parts = normalised.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] === '' ? [] : (parts[0] ?? '').split(':');
  const tail = parts.length === 2 ? (parts[1] === '' ? [] : (parts[1] ?? '').split(':')) : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 && missing !== 0) return null;
  if (parts.length === 2 && missing < 0) return null;
  const middle = new Array<string>(missing).fill('0');
  const all = [...head, ...middle, ...tail];
  if (all.length !== 8) return null;
  return all.map((g) => g.padStart(4, '0'));
}

function isBlockedIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return false;
  // ::1 — loopback
  if (groups.every((g, i) => (i < 7 ? g === '0000' : g === '0001'))) return true;
  // :: — unspecified
  if (groups.every((g) => g === '0000')) return true;
  const first = parseInt(groups[0] ?? '0', 16);
  // fc00::/7 — unique-local
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 — link-local
  if ((first & 0xffc0) === 0xfe80) return true;
  // ff00::/8 — multicast
  if ((first & 0xff00) === 0xff00) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — classify by embedded v4
  if (
    groups[0] === '0000' &&
    groups[1] === '0000' &&
    groups[2] === '0000' &&
    groups[3] === '0000' &&
    groups[4] === '0000' &&
    groups[5] === 'ffff'
  ) {
    const high = parseInt(groups[6] ?? '0', 16);
    const low = parseInt(groups[7] ?? '0', 16);
    const v4 = [
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 8) & 0xff,
      low & 0xff,
    ].join('.');
    return isBlockedIpv4(v4);
  }
  return false;
}

function isBlockedAddress(ip: string): boolean {
  if (parseIpv4Octets(ip)) return isBlockedIpv4(ip);
  if (ip.includes(':')) return isBlockedIpv6(ip);
  return false;
}

function hostnameLooksLikeIp(hostname: string): boolean {
  if (parseIpv4Octets(hostname)) return true;
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  return false;
}

function literalIpFromHostname(hostname: string): string | null {
  if (parseIpv4Octets(hostname)) return hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return null;
}

class NoopResolver implements AddressResolver {
  async resolve(hostname: string): Promise<string[]> {
    throw new Error(
      `assertSafeFetchUrl: no resolver supplied — cannot validate hostname "${hostname}"`,
    );
  }
}

export async function assertSafeFetchUrl(
  input: string,
  options: AssertSafeFetchUrlOptions = {},
): Promise<URL> {
  if (typeof input !== 'string' || input.length === 0) {
    throw new UnsafeFetchUrlError('invalid-url');
  }
  if (input.length > MAX_URL_LENGTH) {
    throw new UnsafeFetchUrlError('url-too-long');
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new UnsafeFetchUrlError('invalid-url');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeFetchUrlError('protocol-not-allowed', parsed.protocol);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    throw new UnsafeFetchUrlError('userinfo-not-allowed');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new UnsafeFetchUrlError('invalid-url', 'empty-hostname');
  }

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new UnsafeFetchUrlError('blocked-hostname', hostname);
  }

  const literalIp = literalIpFromHostname(hostname);
  if (literalIp) {
    if (isBlockedAddress(literalIp)) {
      throw new UnsafeFetchUrlError('blocked-ip', literalIp);
    }
    return parsed;
  }

  if (hostnameLooksLikeIp(hostname)) {
    throw new UnsafeFetchUrlError('invalid-url', `malformed-ip:${hostname}`);
  }

  const resolver = options.resolver ?? new NoopResolver();
  let addresses: string[];
  try {
    addresses = await resolver.resolve(hostname);
  } catch (err) {
    throw new UnsafeFetchUrlError(
      'dns-failure',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new UnsafeFetchUrlError('dns-failure', 'no-addresses');
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new UnsafeFetchUrlError('blocked-ip', address);
    }
  }

  return parsed;
}
