/**
 * Where to send the person after they answer the OAuth consent screen.
 *
 * POST /api/auth/oauth2/consent answers a redirect as `{redirect: true, url}`.
 * The consent page originally read only `redirectURI` / `redirect_uri`, found
 * neither, and dead-ended every authorization at "Approved, but the server did
 * not say where to return to" — after the person had already signed in and
 * approved. The end-to-end probe hit the same shape first and was patched to
 * read `url`; the page was not, so the test passed while the bug shipped.
 *
 * `url` is therefore checked FIRST, because it is the field that actually
 * arrives. The other two are kept as fallbacks rather than removed: the shape
 * is undocumented, and a rename upstream should degrade to a clear error rather
 * than a silent dead end.
 *
 * Pure, and free of any React import, so the field choice is unit-testable —
 * this repo has no component-testing setup and adding one for a three-line
 * lookup is not the trade.
 */
export interface ConsentResult {
  url?: string;
  redirectURI?: string;
  redirect_uri?: string;
}

/**
 * The first candidate that parses as an ABSOLUTE url.
 *
 * Validated rather than passed straight to location.assign(): a relative path
 * would navigate inside this app instead of returning to the client, which
 * looks like the authorization silently failing.
 */
export function consentRedirect(data: ConsentResult | null | undefined): string | undefined {
  for (const c of [data?.url, data?.redirectURI, data?.redirect_uri]) {
    if (typeof c !== "string" || !c.trim()) continue;
    try {
      return new URL(c).href;
    } catch {
      /* not absolute — keep looking */
    }
  }
  return undefined;
}
