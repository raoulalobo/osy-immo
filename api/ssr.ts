// api/ssr.ts
// -------------------------------------------------------------------------------------------------
// Rôle : Serverless function Vercel qui sert TOUTES les requêtes SSR du marketplace.
//
//  - Vercel détecte automatiquement les fichiers de `/api/*` comme des fonctions.
//  - Le `vercel.json` à la racine met en place un rewrite catch-all qui redirige
//    toute requête non-statique vers `/api/ssr` → cette fonction.
//  - Le handler importe le bundle SSR produit par `pnpm build` (dist/server/server.js)
//    qui expose un objet `{ fetch }` au standard Web (Request/Response).
//
// IMPORTANT — pont Node ⇄ Fetch :
//  Le runtime Node de Vercel passe un couple (req: IncomingMessage, res: ServerResponse)
//  classique Node.js — PAS un Request/Response Web standard. Il faut donc :
//   1. Reconstruire une URL absolue (host + x-forwarded-proto) car req.url est relatif.
//   2. Convertir les headers et lire le body en buffer.
//   3. Construire une `Request` fetch passée au handler TanStack.
//   4. Écrire la `Response` retournée dans le `ServerResponse` Vercel.
//
//  `includeFiles: dist/server/**` dans vercel.json embarque le bundle dans la fonction.
// -------------------------------------------------------------------------------------------------

import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error — fichier généré post-build (pnpm build → dist/server/server.js).
import server from "../dist/server/server.js";

// Runtime Node.js (par défaut). Pas d'edge car BetterAuth utilise des modules
// Node (crypto, jose) non polyfillés sur edge runtime.
export const config = {
  runtime: "nodejs",
};

// -----------------------------------------------------------------------------
// Monkey-patch fetch — workaround pour @convex-dev/better-auth ≤0.12.2
//
// Le proxy BetterAuth (`react-start/index.js`) forwarde toutes les requêtes
// `/api/auth/*` vers Convex en passant :
//     fetch(url, { body: request.body, duplex: "half", ... })
//
// Deux pathologies remontent en `expected non-null body source` côté undici :
//
//   A. GET / DELETE sans body : `request.body === null` mais `duplex: "half"`
//      reste défini. undici exige un body si duplex est précisé.
//
//   B. POST / PUT avec body : `request.body` est un `ReadableStream`. Quand
//      la `Request` a été construite à partir d'un Buffer (cas Vercel Node
//      → notre conversion), le stream interne a un `source` que undici
//      considère comme nul à l'envoi sortant. Solution : on bufferise le
//      stream en `Uint8Array` avant le re-fetch — undici l'accepte sans
//      `duplex`, et le sous-handler reçoit exactement les mêmes octets.
//
// Aucun impact sur les fetch externes "normaux" (sans `duplex` et avec body
// JSON/string classique) : le patch ne les modifie pas.
// -----------------------------------------------------------------------------
const originalFetch = globalThis.fetch;
globalThis.fetch = async function patchedFetch(
  input: any,
  init?: RequestInit
): Promise<Response> {
  if (init) {
    // Cas A — body nullish + duplex défini → on retire les deux.
    if (init.body == null && "duplex" in (init as Record<string, unknown>)) {
      const cleaned = { ...init };
      delete (cleaned as any).body;
      delete (cleaned as any).duplex;
      return originalFetch(input, cleaned);
    }
    // Cas B — body est un ReadableStream → on le bufferise puis on retire duplex.
    if (init.body && typeof (init.body as any).getReader === "function") {
      const ab = await new Response(init.body as ReadableStream).arrayBuffer();
      const cleaned = { ...init, body: new Uint8Array(ab) };
      delete (cleaned as any).duplex;
      return originalFetch(input, cleaned);
    }
  }
  return originalFetch(input, init);
} as typeof fetch;

/**
 * Handler Vercel Node :
 *  - lit IncomingMessage
 *  - construit une Request fetch absolue
 *  - délègue au handler SSR TanStack
 *  - réémet la Response sur ServerResponse
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    // -- 1) URL absolue (host + protocole) ---------------------------------
    const host = req.headers.host ?? "localhost";
    const proto =
      (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
    const url = `${proto}://${host}${req.url ?? "/"}`;

    // -- 2) Headers : copie tous, en concaténant les multi-values ---------
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v == null) continue;
      if (Array.isArray(v)) headers.set(k, v.join(", "));
      else headers.set(k, String(v));
    }

    // -- 3) Body : on lit le stream Node si la méthode peut en avoir un --
    let body: Buffer | undefined;
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    }

    // -- 4) Construit la Request fetch standard ---------------------------
    // Crawlers (Facebook/WhatsApp/Slack) font parfois un HEAD avant le GET.
    // TanStack Start ne sert pas HEAD nativement — on convertit silencieusement
    // en GET pour récupérer la même réponse, puis on n'enverra pas le body
    // ci-dessous quand la méthode initiale était HEAD.
    const isHead = method === "HEAD";
    const request = new Request(url, {
      method: isHead ? "GET" : method,
      headers,
      body,
      // `duplex: 'half'` requis par Node ≥ 18 dès qu'on passe un body
      ...(body ? { duplex: "half" as const } : {}),
    });

    // -- 5) Appelle le handler SSR TanStack ------------------------------
    const response: Response = await server.fetch(request);

    // -- 6) Écrit la Response sur le ServerResponse Vercel ---------------
    res.statusCode = response.status;

    // IMPORTANT — Set-Cookie multi-valeurs :
    //   `Headers.forEach` merge les valeurs identiques en une chaîne CSV.
    //   Or BetterAuth émet PLUSIEURS Set-Cookie (session_token + convex_jwt),
    //   et leurs valeurs contiennent déjà des virgules (Expires=Sun, 17 May…).
    //   Résultat : un seul cookie est transmis et la session est cassée.
    //   On utilise donc `getSetCookie()` (WHATWG fetch standard) qui renvoie
    //   un array, puis `res.setHeader("set-cookie", array)` (Node-compatible).
    const setCookies =
      typeof (response.headers as any).getSetCookie === "function"
        ? (response.headers as any).getSetCookie()
        : [];
    if (setCookies.length > 0) {
      res.setHeader("set-cookie", setCookies);
    }
    response.headers.forEach((value, key) => {
      // Skip set-cookie : déjà géré ci-dessus avec le bon multi-array.
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });

    if (isHead) {
      // HEAD : on bufferise pour calculer le Content-Length, on définit le header,
      // puis on n'écrit AUCUN body (conformément à la spec HTTP).
      // Sans Content-Length, Facebook Sharing Debugger rejette parfois la page
      // avec "Code de réponse erroné".
      const buf = response.body
        ? Buffer.from(await response.arrayBuffer())
        : Buffer.alloc(0);
      res.setHeader("content-length", buf.length);
      res.end();
    } else if (response.body) {
      // GET et autres méthodes : on stream le body au client sans le bufferiser
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err) {
    // Log côté Vercel pour debug + 500 propre côté client
    console.error("[api/ssr] Handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
}
