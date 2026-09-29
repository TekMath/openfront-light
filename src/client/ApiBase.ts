import { ClientEnv } from "./ClientEnv";

// The account/shop API origin (api.<audience>). Lives apart from Api.ts so
// modules that Api.ts itself depends on (ServerList) can reach it without an
// import cycle; Api.ts re-exports both for its existing importers.

// openfront-light: a self-hosted server has no closed-source API (accounts,
// JWT refresh, cosmetics catalog, ...). Callers that would only ever fail
// against it check this first and skip the request, instead of failing and
// logging a warning on every page load.
let apiEnabledForTests: boolean | null = null;

export function apiEnabled(): boolean {
  return apiEnabledForTests ?? false;
}

/**
 * Test-only: turn the upstream API behaviour back on (true), or restore the
 * light default (null), for suites written against the API.
 */
export function setApiEnabledForTests(enabled: boolean | null): void {
  apiEnabledForTests = enabled;
}

export function getApiBase() {
  const domainname = getAudience();

  if (domainname === "localhost") {
    const apiDomain = process.env.API_DOMAIN;
    if (apiDomain) {
      return `https://${apiDomain}`;
    }
    return localStorage.getItem("apiHost") ?? "http://localhost:8787";
  }

  return `https://api.${domainname}`;
}

export function getAudience() {
  // Sourced from BOOTSTRAP_CONFIG (server/desktop-injected) rather than
  // window.location, so the desktop app (app://openfront) targets real infra.
  return ClientEnv.jwtAudience();
}
