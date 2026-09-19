import { AuthConfig } from "convex/server";

// Built-in sign-in: tokens are signed by this app itself (convex/authActions.ts)
// and checked against the public key served at /.well-known/jwks.json
// (convex/http.ts). No outside login company is involved.
//
// issuer / applicationID must match AUTH_ISSUER / AUTH_AUDIENCE in
// convex/lib/authShared.ts.
export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "farooq-bizmanager",
      issuer: "https://farooq-bizmanager.local",
      jwks: `${process.env.CONVEX_SITE_URL}/.well-known/jwks.json`,
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
