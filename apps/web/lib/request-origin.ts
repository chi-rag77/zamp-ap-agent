import type {NextRequest} from 'next/server';

/**
 * Validate browser mutations against the public app origin. Behind a reverse
 * proxy, NextRequest.nextUrl.origin can resolve to Render's private listener
 * (for example http://0.0.0.0:10000) instead of the origin in the browser.
 */
export function originMatchesPublicApp(
  originHeader: string | null,
  requestOrigin: string,
  publicAppUrl = process.env.NEXT_PUBLIC_APP_URL,
  production = process.env.NODE_ENV === 'production',
): boolean {
  if (!originHeader) return false;

  try {
    const receivedOrigin = new URL(originHeader);
    if (receivedOrigin.protocol !== 'https:' && receivedOrigin.protocol !== 'http:') return false;

    // Production must use an explicitly configured public URL. Falling back to
    // the proxy request origin here recreates the mismatch this guard prevents.
    const expected = publicAppUrl ? new URL(publicAppUrl) : production ? null : new URL(requestOrigin);
    if (!expected || (expected.protocol !== 'https:' && expected.protocol !== 'http:')) return false;
    return receivedOrigin.origin === expected.origin;
  } catch {
    return false;
  }
}

export function hasTrustedOrigin(request: NextRequest): boolean {
  return originMatchesPublicApp(
    request.headers.get('origin'),
    request.nextUrl.origin,
  );
}
