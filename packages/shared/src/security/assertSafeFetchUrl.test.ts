import { describe, expect, it } from 'vitest';
import {
  UnsafeFetchUrlError,
  assertSafeFetchUrl,
  type AddressResolver,
} from './assertSafeFetchUrl.js';

const fixedResolver = (map: Record<string, string[]>): AddressResolver => ({
  async resolve(hostname: string): Promise<string[]> {
    const ips = map[hostname];
    if (!ips) throw new Error(`No fake DNS entry for ${hostname}`);
    return ips;
  },
});

const okResolver = fixedResolver({
  'swg3.co.uk': ['203.0.113.10'],
  'example.com': ['198.51.100.1'],
  'cdn.example.com': ['2001:db8::1'],
});

describe('assertSafeFetchUrl — protocol allowlist', () => {
  it('accepts http: and returns the parsed URL', async () => {
    const url = await assertSafeFetchUrl('http://example.com/path', {
      resolver: okResolver,
    });
    expect(url.protocol).toBe('http:');
    expect(url.hostname).toBe('example.com');
  });

  it('accepts https:', async () => {
    const url = await assertSafeFetchUrl('https://swg3.co.uk/events/funk-night', {
      resolver: okResolver,
    });
    expect(url.protocol).toBe('https:');
  });

  it('rejects file://', async () => {
    await expect(
      assertSafeFetchUrl('file:///etc/passwd', { resolver: okResolver }),
    ).rejects.toMatchObject({
      name: 'UnsafeFetchUrlError',
      reason: 'protocol-not-allowed',
    });
  });

  it('rejects gopher://', async () => {
    await expect(
      assertSafeFetchUrl('gopher://example.com/_x', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'protocol-not-allowed' });
  });

  it('rejects ftp://', async () => {
    await expect(
      assertSafeFetchUrl('ftp://example.com/x', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'protocol-not-allowed' });
  });

  it('rejects data:', async () => {
    await expect(
      assertSafeFetchUrl('data:text/plain;base64,SGVsbG8=', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'protocol-not-allowed' });
  });
});

describe('assertSafeFetchUrl — input shape', () => {
  it('rejects empty input', async () => {
    await expect(
      assertSafeFetchUrl('', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'invalid-url' });
  });

  it('rejects unparseable input', async () => {
    await expect(
      assertSafeFetchUrl('not a url', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'invalid-url' });
  });

  it('rejects null/undefined', async () => {
    await expect(
      assertSafeFetchUrl(null as unknown as string, { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'invalid-url' });
    await expect(
      assertSafeFetchUrl(undefined as unknown as string, { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'invalid-url' });
  });

  it('rejects URLs longer than 2000 characters', async () => {
    const long = 'https://example.com/' + 'a'.repeat(2001);
    await expect(
      assertSafeFetchUrl(long, { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'url-too-long' });
  });
});

describe('assertSafeFetchUrl — userinfo', () => {
  it('rejects URLs containing username userinfo', async () => {
    await expect(
      assertSafeFetchUrl('https://attacker@example.com/x', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'userinfo-not-allowed' });
  });

  it('rejects URLs containing username:password userinfo', async () => {
    await expect(
      assertSafeFetchUrl('https://a:b@example.com/x', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'userinfo-not-allowed' });
  });
});

describe('assertSafeFetchUrl — literal IP hostnames', () => {
  it('rejects IPv4 loopback as literal hostname', async () => {
    await expect(
      assertSafeFetchUrl('http://127.0.0.1/x', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects IPv4 loopback in 127.0.0.0/8', async () => {
    await expect(
      assertSafeFetchUrl('http://127.255.0.1/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects AWS/GCP metadata IP 169.254.169.254', async () => {
    await expect(
      assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/', {
        resolver: okResolver,
      }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects link-local 169.254.0.0/16', async () => {
    await expect(
      assertSafeFetchUrl('http://169.254.0.5/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects RFC 1918 10.0.0.0/8', async () => {
    await expect(
      assertSafeFetchUrl('http://10.0.0.1/admin', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects RFC 1918 172.16.0.0/12 (boundary 172.16)', async () => {
    await expect(
      assertSafeFetchUrl('http://172.16.0.1/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects RFC 1918 172.16.0.0/12 (boundary 172.31)', async () => {
    await expect(
      assertSafeFetchUrl('http://172.31.255.254/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('does NOT reject 172.32.0.1 (outside RFC 1918 172.16/12)', async () => {
    const url = await assertSafeFetchUrl('http://172.32.0.1/', {
      resolver: fixedResolver({ '172.32.0.1': ['172.32.0.1'] }),
    });
    expect(url.hostname).toBe('172.32.0.1');
  });

  it('rejects RFC 1918 192.168.0.0/16', async () => {
    await expect(
      assertSafeFetchUrl('http://192.168.1.1/router', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects 0.0.0.0 unspecified', async () => {
    await expect(
      assertSafeFetchUrl('http://0.0.0.0/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects IPv6 loopback [::1]', async () => {
    await expect(
      assertSafeFetchUrl('http://[::1]/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects IPv6 unique-local fc00::/7', async () => {
    await expect(
      assertSafeFetchUrl('http://[fc00::1]/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects IPv6 link-local fe80::/10', async () => {
    await expect(
      assertSafeFetchUrl('http://[fe80::1]/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects IPv6 unspecified [::]', async () => {
    await expect(
      assertSafeFetchUrl('http://[::]/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });
});

describe('assertSafeFetchUrl — hostname reserved labels', () => {
  it('rejects hostname "localhost"', async () => {
    await expect(
      assertSafeFetchUrl('http://localhost:3000/admin', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-hostname' });
  });

  it('rejects hostname "localhost" case-insensitively', async () => {
    await expect(
      assertSafeFetchUrl('http://LocalHost/', { resolver: okResolver }),
    ).rejects.toMatchObject({ reason: 'blocked-hostname' });
  });
});

describe('assertSafeFetchUrl — DNS resolution', () => {
  it('rejects when DNS resolves to loopback (rebinding defence)', async () => {
    const rebound = fixedResolver({ 'evil.example.com': ['127.0.0.1'] });
    await expect(
      assertSafeFetchUrl('http://evil.example.com/', { resolver: rebound }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects when DNS resolves to metadata IP', async () => {
    const rebound = fixedResolver({
      'aws.evil.test': ['169.254.169.254'],
    });
    await expect(
      assertSafeFetchUrl('http://aws.evil.test/', { resolver: rebound }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects when ANY resolved address is unsafe (multi-A defence)', async () => {
    const mixed = fixedResolver({
      'mixed.example.com': ['203.0.113.5', '10.0.0.1'],
    });
    await expect(
      assertSafeFetchUrl('http://mixed.example.com/', { resolver: mixed }),
    ).rejects.toMatchObject({ reason: 'blocked-ip' });
  });

  it('rejects when DNS resolver throws', async () => {
    const failing: AddressResolver = {
      async resolve(): Promise<string[]> {
        throw new Error('NXDOMAIN');
      },
    };
    await expect(
      assertSafeFetchUrl('http://nx.example.com/', { resolver: failing }),
    ).rejects.toMatchObject({ reason: 'dns-failure' });
  });

  it('rejects when DNS returns no addresses', async () => {
    const empty: AddressResolver = {
      async resolve(): Promise<string[]> {
        return [];
      },
    };
    await expect(
      assertSafeFetchUrl('http://empty.example.com/', { resolver: empty }),
    ).rejects.toMatchObject({ reason: 'dns-failure' });
  });

  it('accepts public IPv4 with public hostname', async () => {
    const url = await assertSafeFetchUrl('https://example.com/x', {
      resolver: okResolver,
    });
    expect(url.toString()).toBe('https://example.com/x');
  });

  it('accepts public IPv6', async () => {
    const url = await assertSafeFetchUrl('https://cdn.example.com/x', {
      resolver: okResolver,
    });
    expect(url.hostname).toBe('cdn.example.com');
  });
});

describe('assertSafeFetchUrl — error class', () => {
  it('throws UnsafeFetchUrlError with a stable reason code', async () => {
    try {
      await assertSafeFetchUrl('file:///x', { resolver: okResolver });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeFetchUrlError);
      expect((err as UnsafeFetchUrlError).reason).toBe('protocol-not-allowed');
    }
  });
});
