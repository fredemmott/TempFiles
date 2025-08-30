import {DownloadRequest} from "../../gen/api/files/DownloadRequest";

export type {DownloadRequest as Request}

export async function exec(request: DownloadRequest): Promise<Uint8Array<ArrayBuffer>> {
  const endpoint = "/api/files/download";
  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(request),
    headers: {"Accept": "application/octet-stream"}
  });
  if (!response.ok) {
    throw response;
  }
  const bytes = await response.bytes();
  console.log(bytes);
  return bytes;
}