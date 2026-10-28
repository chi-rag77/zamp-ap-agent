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

  it('paginates recipient metadata and returns only matching IDs', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: [
      { id: 'personal', to_addresses: ['chiragshetty8088@gmail.com'] },
      { id: 'configured', to_addresses: ['Zamp AP <ocrzamp.ap01@gmail.com>'] },
    ], error: null });
    const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => ({ range })) })) })) };
    await expect(mailboxIntakeIds(db, 'ocrzamp.ap01@gmail.com', 10)).resolves.toEqual(['configured']);
    expect(range).toHaveBeenCalledWith(0, 499);
  });
});
