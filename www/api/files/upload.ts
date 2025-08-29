import {UploadRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse} from "../../gen/api/files/UploadResponse";

export type {UploadRequest as Request, UploadResponse as Response}

export async function exec(request: UploadRequest): Promise<UploadResponse> {
  const form_request = new FormData();
  for (const [key, value] of Object.entries(request)) {
    if (value === true) {
      form_request.set(key, "true");
    } else if (value === false) {
      form_request.set(key, "false");
    } else {
      form_request.set(key, value);
    }
  }

  const endpoint = "/api/files/upload";
  const response = await fetch(endpoint, {method: "POST", body: form_request});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}