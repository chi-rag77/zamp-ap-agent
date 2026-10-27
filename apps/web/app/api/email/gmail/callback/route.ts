import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { localWorkspace } from '../../../../../lib/data';
import { storeGmailRefreshToken } from '@zamp/email';

export const runtime = 'nodejs';

const callbackPath = '/api/email/gmail/callback';
const stateCookie = 'zamp_gmail_oauth_state';

function equalState(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function redirectToIntake(request: NextRequest, result: 'connected' | 'error') {
  const url = new URL('/email-intake', request.nextUrl.origin);
  url.searchParams.set('gmail', result);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!localWorkspace()) return NextResponse.json({ error: 'Gmail connection is unavailable outside the connected workspace.' }, { status: 404 });

  const error = request.nextUrl.searchParams.get('error');
  if (error) return redirectToIntake(request, 'error');

  const code = request.nextUrl.searchParams.get('code');
  const receivedState = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(stateCookie)?.value;
  if (!code || !receivedState || !expectedState || !equalState(expectedState, receivedState)) {
    return NextResponse.json({ error: 'Gmail authorization could not be verified. Start the connection again.' }, { status: 400 });
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const mailbox = process.env.GMAIL_INVOICE_MAILBOX;
  if (!clientId || !clientSecret || !mailbox) {
    return NextResponse.json({ error: 'Gmail OAuth client and mailbox configuration are incomplete.' }, { status: 503 });
  }

  const redirectUri = process.env.GMAIL_REDIRECT_URI || new URL(callbackPath, request.nextUrl.origin).toString();
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Google OAuth is temporarily unavailable. Try connecting again.' }, { status: 502 });
  }

  if (!tokenResponse.ok) return NextResponse.json({ error: 'Google rejected the OAuth exchange. Check the client and redirect URI.' }, { status: 502 });
  const tokenData = await tokenResponse.json() as { refresh_token?: string; scope?: string };
  const grantedScopes = new Set((tokenData.scope ?? '').split(/\s+/));
  if (!grantedScopes.has('https://www.googleapis.com/auth/gmail.readonly') || !grantedScopes.has('https://www.googleapis.com/auth/gmail.send')) {
    return NextResponse.json({ error: 'Google did not return both Gmail read and send permissions. Reconnect and approve both scopes.' }, { status: 400 });
  }

  try {
    if (!tokenData.refresh_token) return NextResponse.json({ error: 'Google did not issue a refresh token. Reconnect and approve the Gmail permissions.' }, { status: 400 });
    await storeGmailRefreshToken(mailbox, tokenData.refresh_token, [...grantedScopes]);
  } catch {
    return NextResponse.json({ error: 'Gmail connected, but its secure server-side credential record could not be saved.' }, { status: 500 });
  }

  const response = redirectToIntake(request, 'connected');
  response.cookies.delete(stateCookie);
  return response;
}
