/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {UploadRequest} from "../../gen/api/files/UploadRequest";
import {UploadResponse} from "../../gen/api/files/UploadResponse";
import * as Base64 from "../../Base64";
import * as APICall from "../APICall";

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

    form_request.set(key, Base64.encode(value));
  }

  const body = await APICall.authenticated_json(
    "/api/files/upload",
    {
      body: form_request,
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