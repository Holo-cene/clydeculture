import { lookup } from 'node:dns/promises';
import type { AddressResolver } from './assertSafeFetchUrl.js';

/**
 * Default DNS resolver backed by Node's `dns/promises.lookup`. Returns all
 * addresses (IPv4 + IPv6) so that `assertSafeFetchUrl` can refuse if ANY
 * resolved address is in a blocked range.
 */
export const nodeDnsResolver: AddressResolver = {
  async resolve(hostname: string): Promise<string[]> {
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return entries.map((e) => e.address);
  },
};
