export type DownloadProgress = { received: number; total: number };
type WritableFile = { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type SaveFileHandle = { createWritable(): Promise<WritableFile> };
type SavePickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveFileHandle> };
const MEMORY_LIMIT = 256 * 1024 * 1024;

export function downloadableVideo(url: string) { return /\.(mp4|webm)(?:[?#]|$)/i.test(url); }

// Only save the original direct video response. HLS playlists and protected sources
// need their own offline licences or packaging, so they are never saved as a movie.
export async function downloadVideo(url: string, title: string, signal: AbortSignal, onProgress: (progress: DownloadProgress) => void) {
  if (!downloadableVideo(url)) throw new Error("此分流仅支持提前缓冲");
  const extension = /\.webm(?:[?#]|$)/i.test(url) ? "webm" : "mp4";
  const mime = extension === "webm" ? "video/webm" : "video/mp4";
  const name = (title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "视频") + "." + extension;
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  let file: WritableFile | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  try {
    // Open the picker before the network request while the user's gesture is active.
    if (picker) {
      const handle = await picker.call(window, { suggestedName: name, types: [{ description: "视频", accept: { [mime]: ["." + extension] } }] });
      signal.throwIfAborted();
      file = await handle.createWritable();
    }
    signal.throwIfAborted();
    response = await fetch(url, { signal, credentials: "omit" });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? "此分流暂不允许下载" : "下载失败，请稍后重试");
    if (response.status === 206) throw new Error("此分流仅支持提前缓冲");
    const contentType = response.headers.get("content-type") || "";
    if (/text\/|json|mpegurl|dash\+xml/i.test(contentType)) throw new Error("此分流仅支持提前缓冲");
    const total = Math.max(0, Number(response.headers.get("content-length")) || 0);
    if (!file && total > MEMORY_LIMIT) throw new Error("文件较大，请用 Chrome 或 Edge 下载");
    if (!response.body) throw new Error("此分流暂不允许下载");
    reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    const prefix = new Uint8Array(128);
    let prefixLength = 0;
    let received = 0;
    onProgress({ received, total });
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (prefixLength < prefix.length) {
        const length = Math.min(prefix.length - prefixLength, value.byteLength);
        prefix.set(value.subarray(0, length), prefixLength);
        prefixLength += length;
        if (/^\s*(#EXTM3U|<\?xml|<MPD|<!doctype|<html|\{)/i.test(new TextDecoder().decode(prefix.subarray(0, prefixLength)))) throw new Error("此分流仅支持提前缓冲");
      }
      received += value.byteLength;
      if (file) await file.write(value);
      else {
        if (received > MEMORY_LIMIT) throw new Error("文件较大，请用 Chrome 或 Edge 下载");
        // Own a compact buffer; avoid retaining a large shared streaming buffer.
        chunks.push(value.slice().buffer as ArrayBuffer);
      }
      onProgress({ received, total });
    }
    signal.throwIfAborted();
    if (received === 0) throw new Error("下载内容为空");
    if (total && received !== total) throw new Error("下载不完整，请重试");
    if (file) { await file.close(); file = undefined; }
    else {
      const blob = URL.createObjectURL(new Blob(chunks, { type: mime }));
      const link = document.createElement("a");
      link.href = blob; link.download = name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blob), 60_000);
    }
    return name;
  } catch (error) {
    if (reader) await reader.cancel().catch(() => {});
    else await response?.body?.cancel().catch(() => {});
    await file?.abort().catch(() => {});
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new DOMException("下载已取消", "AbortError");
    if (error instanceof DOMException && /NotAllowedError|SecurityError/.test(error.name)) throw new Error("浏览器未允许保存");
    if (error instanceof TypeError) throw new Error("此分流暂不允许下载");
    throw error;
  } finally { reader?.releaseLock(); }
}
