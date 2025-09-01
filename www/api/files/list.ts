/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {ListResponse} from "../../gen/api/files/ListResponse";
import * as APICall from "../APICall";
import * as Base64 from "../../Base64";

export type {ListResponse as Response}

export async function exec(): Promise<ListResponse> {
  const body = await APICall.authenticatedJSON("/api/files/list");
  return {
    ...body,
    files: body.files.map((file: any) => {
      return {
        ...file,
        salt: Base64.decode(file.salt),
        data_iv: Base64.decode(file.data_iv),
        filename_iv: Base64.decode(file.filename_iv),
        encrypted_filename: Base64.decode(file.encrypted_filename),
      };
    }),
  };
}