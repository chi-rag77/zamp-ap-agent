export function workosAuthConfigured() {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_COOKIE_PASSWORD &&
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );
}

/**
 * Return the externally reachable AuthKit callback. Render and other proxy
 * platforms can expose an internal Host header (for example 0.0.0.0:10000),
 * so OAuth URLs must use the configured public callback explicitly.
 */
export function workosRedirectUri() {
  const redirectUri=process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if(!redirectUri)return undefined;
  try{
    const url=new URL(redirectUri);
    if(url.protocol!=='https:'&&url.hostname!=='localhost')return undefined;
    return url.toString();
  }catch{
    return undefined;
  }
}

// Credentials can be provisioned before tenant isolation is ready. Authentication
// stays opt-in until all business data paths enforce organization scope.
export function workosAuthEnabled() {
  return (
    process.env.ZAMP_AUTH_REQUIRED === 'true' &&
    process.env.ZAMP_TENANT_ISOLATION_READY === 'true' &&
    workosAuthConfigured()
  );
}
