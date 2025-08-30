import {DownloadRequest} from "../../gen/api/files/DownloadRequest";
import * as Session from "../../Session";

export type {DownloadRequest as Request}

export async function exec(request: DownloadRequest): Promise<Uint8Array<ArrayBuffer>> {
  const endpoint = "/api/files/download";
  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify(request),
    headers: {
      "Accept": "application/octet-stream",
      "Authorization": `Bearer ${Session.token()}`,
    },
  });
  if (!response.ok) {
    throw response;
  }
  return await response.bytes();
}