import {UploadRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse} from "../../gen/api/files/UploadResponse";

export type {UploadRequest as Request, UploadResponse as Response}

function base64_encode(data: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...data));
}

export async function exec(request: UploadRequest): Promise<UploadResponse> {
  const form_request = new FormData();
  for (const [key, value] of Object.entries(request)) {
    if (typeof value === 'boolean') {
      form_request.set(key, value.toString());
      continue;
    }
    if (typeof value === 'string') {
      form_request.set(key, value);
      continue;
    }
    if (key === 'encrypted_data') {
      form_request.set(key, new Blob([value], {type: 'application/octet-stream'}));
      continue;
    }

    form_request.set(key, base64_encode(value));
  }

  const endpoint = "/api/files/upload";
  const response = await fetch(endpoint, {method: "POST", body: form_request});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}