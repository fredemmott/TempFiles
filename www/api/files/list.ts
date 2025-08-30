import {ListResponse} from "../../gen/api/files/ListResponse";
import * as Session from "../../Session";

export type {ListResponse as Response}

function base64_decode(encoded: string): Uint8Array<ArrayBuffer> {
  const str = atob(encoded);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

export async function exec(): Promise<ListResponse> {
  const endpoint = "/api/files/list";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {"Authorization": `Bearer ${Session.token()}`},
  });
  if (!response.ok) {
    throw response;
  }
  const body = await response.json();
  return {
    ...body,
    files: body.files.map((file: any) => {
      return {
        ...file,
        salt: base64_decode(file.salt),
        data_iv: base64_decode(file.data_iv),
        filename_iv: base64_decode(file.filename_iv),
        encrypted_filename: base64_decode(file.encrypted_filename),
      };
    }),
  };
}