"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { consentRedirect, type ConsentResult } from "@/lib/consent-redirect";

/**
 * OAuth consent screen.
 *
 * The authorization endpoint sends a signed query here once the person is
 * authenticated. Everything needed to resume the flow is in that query, so this
 * page's job is narrow: show WHO is asking and for WHAT, then hand the same
 * query back to /oauth2/consent with the person's answer. It never invents
 * scopes or rewrites the query — doing so would invalidate the signature.
 *
 * This is the last screen before a token exists. Registration is open (any
 * client can register itself via DCR), so this consent is the only thing
 * standing between a stranger's client and someone's data — which is why it
 * names the client and its redirect target rather than just saying "an app".
 */
interface ConsentInfo {
  clientName?: string;
  name?: string;
  clientUri?: string;
}

function ConsentInner() {
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /* useSearchParams rather than window.location: it is available on the first
     render, so the signed query needs no state and no setState inside an
     effect. The Suspense boundary below is what this hook requires. */
  const query = useSearchParams().toString();

  /* The signed query already carries everything the person needs to judge this:
     which client, where it will send them, and what it asked for. Those are
     read straight off it rather than fetched, so the screen still renders if
     the lookup below fails.

     NOT /oauth2/get-consent — that reads a STORED consent by its id, not a
     pending request, and answers 400 here. /oauth2/public-client is the
     consent-screen endpoint: it turns a client_id into the client's own
     public name and URI. */
  const params = new URLSearchParams(query);
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo((d ?? {}) as ConsentInfo))
      .catch(() => setInfo({}));
  }, [clientId]);

  const answer = async (accept: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accept, oauth_query: query }),
      });
      const data = (await res.json().catch(() => null)) as ConsentResult | null;

      const back = consentRedirect(data);
      if (back) {
        window.location.assign(back);
        return;
      }
      if (!res.ok) throw new Error(`The server rejected that (${res.status})`);
      setError(
        "Approved, but the server did not say where to return to. " +
          "Start the connection again from the app that sent you.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  /* Fall back to the client id rather than a vague "an application": on an
     open-registration server, naming exactly who is asking is the point. */
  /* Derived during render, not set from an effect: it is a pure function of
     the query string, which is known on the first render. */
  const linkError = clientId
    ? ""
    : "This link is missing its client — start the connection again from the app that sent you.";

  const name = info?.clientName?.trim() || info?.name?.trim() || clientId || "An unidentified application";

  return (
    <div className="min-h-screen flex items-center justify-center bg-coder-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-xl font-semibold text-white">Authorize {name}</h1>
        <p className="mt-2 text-sm text-white/60">
          It is asking to read and act on your Event Radar data as you.
        </p>

        {redirectUri && (
          <p className="mt-4 text-xs text-white/40 break-all">
            You will be returned to <span className="text-white/60">{redirectUri}</span>
          </p>
        )}

        {scopes.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {scopes.map((s) => (
              <li key={s} className="text-sm text-white/70">• {s}</li>
            ))}
          </ul>
        )}

        {(error || linkError) && <p className="mt-5 text-sm text-red-400">{error || linkError}</p>}

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => answer(true)}
            disabled={busy || !clientId}
            className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
          >
            {busy ? "Working…" : "Allow"}
          </button>
          <button
            type="button"
            onClick={() => answer(false)}
            disabled={busy}
            className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/80 disabled:opacity-40"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentInner />
    </Suspense>
  );
}
