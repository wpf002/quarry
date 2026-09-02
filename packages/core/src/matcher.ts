// The scope matcher. This is the most safety-critical code in Quarry.
//
// It decides whether a concrete `target` is authorized by an Allowlist
// `pattern`. It is a PURE function with no I/O so it can be tested
// adversarially without a database. The gate (scope-enforcer.ts) layers the
// DB checks (live allowlist row + valid, unexpired ScanApproval) on top.
//
// Non-negotiable rule: substring matching is a bug. `evil-acme.com` must never
// match `acme.com`. Every branch fails CLOSED — anything it is not certain
// about returns `false`.

export interface MatchOutcome {
  allowed: boolean;
  /** Human-/audit-readable reason, useful in tests and AuditLog detail. */
  reason: string;
}

type PatternKind = 'wildcard' | 'cidr' | 'url' | 'host';

/** Public entry point used by the gate. */
export function matches(
  pattern: string,
  target: string,
  allowWildcard: boolean,
): boolean {
  return evaluate(pattern, target, allowWildcard).allowed;
}

/** Same as `matches` but returns the reason, for auditing and tests. */
export function evaluate(
  pattern: string,
  target: string,
  allowWildcard: boolean,
): MatchOutcome {
  const p = (pattern ?? '').trim();
  const t = (target ?? '').trim();
  if (p === '' || t === '') return no('empty pattern or target');

  switch (classify(p)) {
    case 'wildcard':
      return matchWildcard(p, t, allowWildcard);
    case 'cidr':
      return matchCidr(p, t);
    case 'url':
      return matchUrlPrefix(p, t);
    case 'host':
      return matchExactHost(p, t);
  }
}

function classify(pattern: string): PatternKind {
  if (pattern.includes('*')) return 'wildcard';
  if (/^https?:\/\//i.test(pattern)) return 'url';
  if (isCidr(pattern)) return 'cidr';
  return 'host';
}

// --- wildcard --------------------------------------------------------------

function matchWildcard(
  pattern: string,
  target: string,
  allowWildcard: boolean,
): MatchOutcome {
  if (!allowWildcard) return no('wildcard pattern but allowWildcard is false');
  // Only a leading-label wildcard is permitted: `*.example.com`.
  if (!pattern.startsWith('*.') || pattern.indexOf('*', 1) !== -1) {
    return no(`unsupported wildcard placement: ${pattern}`);
  }
  const suffix = normalizeHost(pattern.slice(2));
  if (suffix === null || !suffix.includes('.')) {
    return no(`invalid wildcard suffix: ${pattern}`);
  }
  const host = targetToHost(target);
  if (host === null) return no('target has no resolvable host component');
  // Must be a strict subdomain: boundary is the dot. `acme.com` and
  // `evil-acme.com` both fail; `a.b.acme.com` passes.
  if (host === suffix) return no('wildcard does not cover the apex itself');
  if (host.endsWith('.' + suffix)) return yes(`subdomain of ${suffix}`);
  return no(`host ${host} not under ${suffix}`);
}

// --- exact host ------------------------------------------------------------

function matchExactHost(pattern: string, target: string): MatchOutcome {
  const want = normalizeHost(pattern);
  if (want === null) return no(`invalid host pattern: ${pattern}`);
  const host = targetToHost(target);
  if (host === null) return no('target has no resolvable host component');
  return host === want
    ? yes(`exact host ${want}`)
    : no(`host ${host} != ${want}`);
}

// --- url prefix ------------------------------------------------------------

function matchUrlPrefix(pattern: string, target: string): MatchOutcome {
  const pu = parseUrl(pattern);
  if (pu === null) return no(`invalid url pattern: ${pattern}`);
  // The target must itself be a full URL; a bare host is not authorized by a
  // URL-prefix pattern (different scheme/port could change the surface).
  const tu = parseUrl(target);
  if (tu === null) return no('target is not a full URL');

  if (pu.protocol !== tu.protocol) return no('scheme mismatch');
  if (pu.host !== tu.host) return no('host/port mismatch'); // host includes port
  // Path prefix with a boundary so `/v2` cannot match `/v20`.
  const pPath = pu.pathname;
  const tPath = tu.pathname;
  if (tPath === pPath) return yes('exact url');
  const prefix = pPath.endsWith('/') ? pPath : pPath + '/';
  if (tPath.startsWith(prefix)) return yes(`under url prefix ${pPath}`);
  return no(`path ${tPath} not under ${pPath}`);
}

function parseUrl(value: string): URL | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

// --- host extraction / normalization --------------------------------------

/** Lowercase, strip a single trailing dot. Returns null for empty/invalid. */
function normalizeHost(value: string): string | null {
  let h = value.trim().toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h === '' || /\s/.test(h) || h.includes('/')) return null;
  return h;
}

/**
 * Extract the host from a target that may be a bare host, `host:port`, an IP,
 * a bracketed IPv6 literal, or a full URL. No DNS resolution ever happens.
 */
function targetToHost(target: string): string | null {
  const t = target.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    const u = parseUrl(t);
    return u ? stripPort(u.host) : null;
  }
  return normalizeHost(stripPort(t));
}

/** Remove a `:port` suffix, handling bracketed IPv6 `[::1]:443`. */
function stripPort(hostport: string): string {
  const h = hostport.trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h.toLowerCase() : h.slice(1, end).toLowerCase();
  }
  const colon = h.indexOf(':');
  // Only treat as host:port when there's exactly one colon (bare IPv6 without
  // brackets would have several and is handled as-is / fails closed elsewhere).
  if (colon !== -1 && h.indexOf(':', colon + 1) === -1) {
    return h.slice(0, colon).toLowerCase();
  }
  return h.toLowerCase();
}

// --- CIDR ------------------------------------------------------------------

function isCidr(pattern: string): boolean {
  const slash = pattern.indexOf('/');
  if (slash === -1) return false;
  const addr = pattern.slice(0, slash);
  const bits = pattern.slice(slash + 1);
  if (!/^\d+$/.test(bits)) return false;
  return ipToBigInt(addr) !== null;
}

function matchCidr(pattern: string, target: string): MatchOutcome {
  const slash = pattern.indexOf('/');
  const net = ipToBigInt(pattern.slice(0, slash));
  const prefix = Number(pattern.slice(slash + 1));
  if (net === null) return no(`invalid CIDR network: ${pattern}`);
  const width = net.version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > width) return no(`invalid CIDR prefix: ${pattern}`);

  const host = targetToHost(target);
  if (host === null) return no('target has no host');
  const ip = ipToBigInt(host);
  // Fail closed: a CIDR pattern only authorizes literal IP targets. We never
  // resolve a hostname to an address to force it into range.
  if (ip === null) return no('CIDR pattern requires a literal IP target');
  if (ip.version !== net.version) return no('IP family mismatch');

  const mask =
    prefix === 0
      ? 0n
      : ((1n << BigInt(prefix)) - 1n) << BigInt(width - prefix);
  return (ip.value & mask) === (net.value & mask)
    ? yes(`within ${pattern}`)
    : no(`${host} outside ${pattern}`);
}

interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

function ipToBigInt(addr: string): ParsedIp | null {
  const a = addr.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) {
    const octets = a.split('.').map(Number);
    if (octets.some((o) => o > 255)) return null;
    let v = 0n;
    for (const o of octets) v = (v << 8n) | BigInt(o);
    return { version: 4, value: v };
  }
  if (a.includes(':')) {
    const v = ipv6ToBigInt(a);
    return v === null ? null : { version: 6, value: v };
  }
  return null;
}

function ipv6ToBigInt(addr: string): bigint | null {
  // Reject anything with more than one `::` and validate each group.
  const parts = addr.split('::');
  if (parts.length > 2) return null;
  const expand = (s: string): string[] => (s === '' ? [] : s.split(':'));
  const head = expand(parts[0] ?? '');
  const tail = parts.length === 2 ? expand(parts[1] ?? '') : [];
  const missing = 8 - (head.length + tail.length);
  if (parts.length === 2) {
    if (missing < 1) return null;
  } else if (head.length !== 8) {
    return null;
  }
  const groups =
    parts.length === 2
      ? [...head, ...Array(missing).fill('0'), ...tail]
      : head;
  let v = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

const yes = (reason: string): MatchOutcome => ({ allowed: true, reason });
const no = (reason: string): MatchOutcome => ({ allowed: false, reason });
