// Cache the app shell only. Media requests and provider limits stay untouched.
const SHELL_CACHE = "dongdong-shell-v1";
let preparing;

function isAsset(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.svg");
}

async function prepareShell() {
  if (preparing) return preparing;
  preparing = (async () => {
    const cache = await caches.open(SHELL_CACHE);
    const response = await fetch("/", { cache: "reload" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Shell unavailable");
    const html = await response.clone().text();
    const paths = [...new Set([...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)].map(match => match[1].replaceAll("&amp;", "&")))];
    if (!paths.length) throw new Error("Shell assets unavailable");
    for (const path of paths) {
      if (await cache.match(path)) continue;
      const asset = await fetch(path, { cache: "reload" });
      if (!asset.ok) throw new Error("Asset unavailable");
      await cache.put(path, asset);
    }
    // Replace the document only after all of its scripts/styles are stored.
    await cache.put("/", response);
    return true;
  })().finally(() => { preparing = undefined; });
  return preparing;
}

self.addEventListener("install", event => event.waitUntil(prepareShell()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("message", event => {
  if (event.data?.type !== "PREPARE_OFFLINE" || !event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  event.waitUntil(prepareShell().then(() => event.ports[0]?.postMessage({ ready: true })).catch(() => event.ports[0]?.postMessage({ ready: false })));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === self.location.origin && url.pathname === "/") {
    event.respondWith(fetch(request).then(response => {
      // A later PREPARE_OFFLINE refreshes the document and its matching assets together.
      if (!response.ok) throw new Error("Navigation unavailable");
      return response;
    }).catch(async () => (await caches.open(SHELL_CACHE)).match("/").then(response => response || Response.error())));
    return;
  }
  if (!isAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  })());
});
