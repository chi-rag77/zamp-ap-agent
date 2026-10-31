import type {SupabaseClient} from '@supabase/supabase-js';

export function normalizeMailboxAddress(value: string): string | null {
  const candidate = value.match(/<\s*([^<>]+)\s*>/)?.[1] ?? value;
  const address = candidate.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

export function intakeBelongsToMailbox(toAddresses: unknown, mailbox: string): boolean {
  const target = normalizeMailboxAddress(mailbox);
  if (!target || !Array.isArray(toAddresses)) return false;
  return toAddresses.some((value) => typeof value === 'string' && normalizeMailboxAddress(value) === target);
}

/**
 * Finds recent intake IDs for one configured mailbox while only selecting recipient
 * metadata. Message subjects, senders, and attachments are fetched after this scope
 * check, so another mailbox's content is never returned to the caller.
 */
export async function mailboxIntakeIds(db: SupabaseClient, mailbox: string, limit: number): Promise<string[]> {
  const target = normalizeMailboxAddress(mailbox);
  if (!target) return [];
  const { data, error } = await db.from('email_intakes').select('id')
    .contains('to_addresses', [target])
    .order('received_at', { ascending: false })
    .limit(Math.max(1, Math.min(1000, Math.floor(limit))));
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}
