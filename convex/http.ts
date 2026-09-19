import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Public half of the sign-in key. Convex reads this to check every token.
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const key = await ctx.runQuery(internal.authStore.getSigningKey, {});
    const keys = key ? [JSON.parse(key.publicJwk)] : [];
    return new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});

export default http;
