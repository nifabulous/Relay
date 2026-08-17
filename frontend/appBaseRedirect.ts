import type { Plugin } from "vite";

export function appBaseRedirectTarget(pathname: string, search = ""): string | null {
  return pathname === "/app" ? `/app/${search}` : null;
}

export function appBaseRedirectPlugin(): Plugin {
  return {
    name: "relay-app-base-redirect",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url ?? "";
        const queryStart = requestUrl.indexOf("?");
        const pathname = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);
        const search = queryStart === -1 ? "" : requestUrl.slice(queryStart);
        const target = appBaseRedirectTarget(pathname, search);
        if (!target) {
          next();
          return;
        }

        res.statusCode = 307;
        res.setHeader("Location", target);
        res.end();
      });
    },
  };
}
