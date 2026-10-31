import { describe, expect, it, vi } from 'vitest';
import { intakeBelongsToMailbox, mailboxIntakeIds, normalizeMailboxAddress } from '../../apps/web/lib/email-intake-scope';

describe('mailbox-scoped email intake', () => {
  it('normalizes plain and display-name email addresses', () => {
    expect(normalizeMailboxAddress('OCRZamp.AP01@gmail.com')).toBe('ocrzamp.ap01@gmail.com');
    expect(normalizeMailboxAddress('Zamp AP <ocrzamp.ap01@gmail.com>')).toBe('ocrzamp.ap01@gmail.com');
    expect(normalizeMailboxAddress('not an address')).toBeNull();
  });

  it('accepts only records addressed to the configured mailbox', () => {
    expect(intakeBelongsToMailbox(['Zamp AP <ocrzamp.ap01@gmail.com>'], 'ocrzamp.ap01@gmail.com')).toBe(true);
    expect(intakeBelongsToMailbox(['chiragshetty8088@gmail.com'], 'ocrzamp.ap01@gmail.com')).toBe(false);
    expect(intakeBelongsToMailbox(null, 'ocrzamp.ap01@gmail.com')).toBe(false);
  });

  it('filters recipients in the database and applies a bounded result limit', async () => {
    const limit = vi.fn().mockResolvedValueOnce({ data: [{ id: 'configured' }], error: null });
    const order = vi.fn(() => ({ limit }));
    const contains = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ contains }));
    const db = { from: vi.fn(() => ({ select })) };
    await expect(mailboxIntakeIds(db as never, 'ocrzamp.ap01@gmail.com', 10)).resolves.toEqual(['configured']);
    expect(contains).toHaveBeenCalledWith('to_addresses', ['ocrzamp.ap01@gmail.com']);
    expect(limit).toHaveBeenCalledWith(10);
  });
});
