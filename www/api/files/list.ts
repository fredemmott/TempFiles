import {ListResponse} from "../../gen/api/files/ListResponse";
import * as APICall from "../APICall";
import base64_decode from "../../base64_decode";

export type {ListResponse as Response}

export async function exec(): Promise<ListResponse> {
  const body = await APICall.authenticated_json("/api/files/list");
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