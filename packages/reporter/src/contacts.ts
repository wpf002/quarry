// Disclosure contact finder. RFC 9116 preference order:
//   security.txt -> /security page -> VDP page -> platform directory ->
//   WHOIS -> common addresses (security@, etc).
// Pure: it ranks signals already gathered by recon; it performs no lookups.

export type ContactMethod =
  | 'security.txt'
  | '/security'
  | 'vdp'
  | 'platform'
  | 'whois'
  | 'common';

export interface DisclosureContact {
  method: ContactMethod;
  value: string;
  rank: number; // lower is more preferred
}

const ORDER: Record<ContactMethod, number> = {
  'security.txt': 1,
  '/security': 2,
  vdp: 3,
  platform: 4,
  whois: 5,
  common: 6,
};

export interface ContactSignals {
  securityTxtContacts?: string[];
  securityPageUrl?: string;
  vdpUrl?: string;
  platformHandleUrl?: string;
  whoisEmail?: string;
  domain: string;
}

export function commonAddresses(domain: string): string[] {
  const apex = domain.replace(/^www\./, '');
  return [`security@${apex}`, `abuse@${apex}`, `soc@${apex}`];
}

export function findContacts(sig: ContactSignals): DisclosureContact[] {
  const out: DisclosureContact[] = [];
  const add = (method: ContactMethod, value?: string) => {
    if (value) out.push({ method, value, rank: ORDER[method] });
  };
  for (const c of sig.securityTxtContacts ?? []) add('security.txt', c);
  add('/security', sig.securityPageUrl);
  add('vdp', sig.vdpUrl);
  add('platform', sig.platformHandleUrl);
  add('whois', sig.whoisEmail);
  for (const c of commonAddresses(sig.domain)) add('common', c);
  return out.sort((a, b) => a.rank - b.rank);
}

export function bestContact(sig: ContactSignals): DisclosureContact | null {
  return findContacts(sig)[0] ?? null;
}
