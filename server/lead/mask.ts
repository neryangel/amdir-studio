// Logs must never contain the message body or contact details in plain text.
import { createHash } from 'node:crypto';

export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const [host = '', ...tld] = domain.split('.');
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld.length ? `.${tld.join('.')}` : ''}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `***${digits.slice(-2)}`;
}

export function maskContact(contact: string): string {
  return contact.includes('@') ? maskEmail(contact) : maskPhone(contact);
}

export function maskName(name: string): string {
  return `${[...name.trim()][0] ?? ''}***`;
}

/** Free text is never logged, only its length. */
export function maskText(text: string): string {
  return `[${[...text].length} chars]`;
}

/** Stable, non-reversible id for an IP (for abuse review without storing the raw IP). */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
