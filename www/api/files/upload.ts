/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {UploadRequest as APIRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse} from "../../gen/api/files/UploadResponse";
import * as Base64 from "../../Base64";
import * as APICall from "../APICall";

export type {UploadResponse as Response}

export interface Request {
  is_e2ee: boolean,
  salt: Uint8Array<ArrayBuffer>,
  filename_iv: Uint8Array<ArrayBuffer>,
  data_iv: Uint8Array<ArrayBuffer>,
  encrypted_filename: Uint8Array<ArrayBuffer>,
  encrypted_data: Uint8Array<ArrayBuffer>,
}

export async function exec(req: Request): Promise<UploadResponse> {
  const apiRequest: APIRequest = {
    is_e2ee: req.is_e2ee ? 'true' : 'false',
    salt: Base64.encode(req.salt),
    filename_iv: Base64.encode(req.filename_iv),
    data_iv: Base64.encode(req.data_iv),
    encrypted_filename: Base64.encode(req.encrypted_filename),
    encrypted_data: new Blob([req.encrypted_data], {type: 'application/octet-stream'})
  };
  const formRequest = new FormData();
  for (const [key, value] of Object.entries(apiRequest)) {
    formRequest.set(key, value);
  }

  const body = await APICall.authenticatedJSON(
    "/api/files/upload",
    {
      body: formRequest,
    });
  return {
    ...body,
    file: {
      ...body.file,
      salt: Base64.decode(body.file.salt),
      data_iv: Base64.decode(body.file.data_iv),
      filename_iv: Base64.decode(body.file.filename_iv),
      encrypted_filename: Base64.decode(body.file.encrypted_filename),
    },
  };
}