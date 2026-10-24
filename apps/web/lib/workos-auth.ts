export function workosAuthConfigured() {
  return Boolean(
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_COOKIE_PASSWORD &&
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );
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
