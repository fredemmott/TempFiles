import {UploadRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse} from "../../gen/api/files/UploadResponse";
import * as Session from "../../Session";
import base64_decode from "../../base64_decode";
import base64_encode from "../../base64_encode";

export type {UploadRequest as Request, UploadResponse as Response}

export async function exec(request: UploadRequest): Promise<UploadResponse> {
  const form_request = new FormData();
  for (const [key, value] of Object.entries(request)) {
    if (typeof value === 'boolean') {
      form_request.set(key, value.toString());
      continue;
    }
    if (key === 'encrypted_data') {
      form_request.set(key, new Blob([value], {type: 'application/octet-stream'}));
      continue;
    }

    form_request.set(key, base64_encode(value));
  }

  const endpoint = "/api/files/upload";
  const response = await fetch(endpoint, {
    method: "POST",
    body: form_request,
    headers: {"Authorization": `Bearer ${Session.token()}`},
  });
  if (!response.ok) {
    throw response;
  }
  const body = await response.json();
  return {
    ...body,
    file: {
      ...body.file,
      salt: base64_decode(body.file.salt),
      data_iv: base64_decode(body.file.data_iv),
      filename_iv: base64_decode(body.file.filename_iv),
      encrypted_filename: base64_decode(body.file.encrypted_filename),
    },
  };
}