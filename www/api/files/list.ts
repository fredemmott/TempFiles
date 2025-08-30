import {ListRequest} from "../../gen/api/files/ListRequest";
import {ListResponse} from "../../gen/api/files/ListResponse";

export type {ListRequest as Request, ListResponse as Response}

function base64_decode(encoded: string): Uint8Array<ArrayBuffer> {
  const str = atob(encoded);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

export async function exec(request: ListRequest): Promise<ListResponse> {
  const endpoint = "/api/files/list";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
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