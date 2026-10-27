import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { localWorkspace } from '../../../../../lib/data';

export const runtime = 'nodejs';

const callbackPath = '/api/email/gmail/callback';
const stateCookie = 'zamp_gmail_oauth_state';

export async function GET(request: NextRequest) {
  if (!localWorkspace()) return NextResponse.json({ error: 'Gmail connection is unavailable outside the connected workspace.' }, { status: 404 });

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const mailbox = process.env.GMAIL_INVOICE_MAILBOX;
  if (!clientId || !clientSecret || !mailbox) {
    return NextResponse.json({ error: 'Configure the Gmail OAuth client and mailbox before connecting Gmail.' }, { status: 503 });
  }

  const redirectUri = process.env.GMAIL_REDIRECT_URI || new URL(callbackPath, request.nextUrl.origin).toString();
  const state = randomBytes(32).toString('base64url');
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const response = NextResponse.redirect(authorization);
  response.cookies.set(stateCookie, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: callbackPath,
    maxAge: 10 * 60,
  });
  return response;
}
