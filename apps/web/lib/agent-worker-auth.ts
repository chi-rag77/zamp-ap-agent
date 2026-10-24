import {timingSafeEqual} from 'node:crypto';

export function isAgentWorkerAuthorized(
  authorization: string | null,
  secrets: Array<string | undefined> = [process.env.AGENT_WORKER_SECRET, process.env.CRON_SECRET],
) {
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  return secrets.filter((secret): secret is string => Boolean(secret)).some((secret) => {
    const expected = Buffer.from(secret);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}
