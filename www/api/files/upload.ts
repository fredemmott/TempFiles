/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {UploadRequest as ClientRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse as ServerResponse} from "../../gen/api/files/UploadResponse";
import APIFile from "./File";
import * as Base64 from "../../Base64";
import * as APICall from "../APICall";

export interface Request {
  uuid: string,
  is_e2ee: boolean,
  salt: Uint8Array<ArrayBuffer>,
  filename_iv: Uint8Array<ArrayBuffer>,
  data_iv: Uint8Array<ArrayBuffer>,
  encrypted_filename: Uint8Array<ArrayBuffer>,
  encrypted_data: Uint8Array<ArrayBuffer>,
  expires_at: null | Date,
  max_downloads: null | number,
}

export interface Response {
  file: APIFile,
}

export async function exec(req: Request): Promise<Response> {
  const clientRequest: ClientRequest = {
    uuid: req.uuid,
    is_e2ee: req.is_e2ee ? 'true' : 'false', // needed for JS <-> Rust FormData, as opposed to JSON
    salt: Base64.encode(req.salt),
    filename_iv: Base64.encode(req.filename_iv),
    data_iv: Base64.encode(req.data_iv),
    encrypted_filename: Base64.encode(req.encrypted_filename),
    encrypted_data: new Blob([req.encrypted_data], {type: 'application/octet-stream'}),
    expires_at: (req.expires_at === null) ? null : req.expires_at.getTime() / 1000,
    max_downloads: req.max_downloads,
  };
  const formRequest = new FormData();
  for (const [key, value] of Object.entries(clientRequest)) {
    if (value === null) {
      continue;
    }

    if (value instanceof Blob) {
      formRequest.set(key, value);
    } else {
      formRequest.set(key, value.toString());
    }
  }

  const body: ServerResponse = await APICall.authenticatedJSON(
    "/api/files/upload",
    {
      body: formRequest,
    });
  return {file: new APIFile(body.file)};
}