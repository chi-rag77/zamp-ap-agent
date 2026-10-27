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
export async function mailboxIntakeIds(db: any, mailbox: string, limit: number): Promise<string[]> {
  if (!normalizeMailboxAddress(mailbox)) return [];
  const pageSize = 500;
  const matches: string[] = [];
  for (let offset = 0; matches.length < limit; offset += pageSize) {
    const { data, error } = await db.from('email_intakes').select('id,to_addresses')
      .order('received_at', { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { id: string; to_addresses: unknown }[];
    for (const row of page) {
      if (intakeBelongsToMailbox(row.to_addresses, mailbox)) matches.push(row.id);
      if (matches.length >= limit) break;
    }
    if (page.length < pageSize) break;
  }
  return matches;
}
