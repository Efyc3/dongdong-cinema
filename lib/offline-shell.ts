let registration: Promise<ServiceWorkerRegistration> | undefined;

export async function prepareOfflineShell(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    registration ??= navigator.serviceWorker.register("/offline-sw.js", { scope: "/", updateViaCache: "none" }).catch(error => { registration = undefined; throw error; });
    await registration;
    return await new Promise<boolean>(resolve => {
      let channel: MessageChannel | undefined;
      let settled = false;
      const finish = (ready: boolean) => { if (settled) return; settled = true; clearTimeout(timer); channel?.port1.close(); resolve(ready); };
      const timer = setTimeout(() => finish(false), 20_000);
      void navigator.serviceWorker.ready.then(ready => {
        if (settled) return;
        if (!ready.active) { finish(false); return; }
        channel = new MessageChannel();
        channel.port1.onmessage = event => finish(event.data?.ready === true);
        ready.active.postMessage({ type: "PREPARE_OFFLINE" }, [channel.port2]);
      }).catch(() => finish(false));
    });
  } catch { return false; }
}
