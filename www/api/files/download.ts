/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {DownloadRequest} from "../../gen/api/files/DownloadRequest";
import * as APICall from "../APICall";

export type {DownloadRequest as Request}

export interface Response {
  encrypted_contents: Uint8Array<ArrayBuffer>,
  is_final_download: boolean,

}

export async function exec(request: DownloadRequest): Promise<Response> {
  const response = await APICall.authenticated(
    "/api/files/download",
    {
      body: JSON.stringify(request),
      headers: {
        "Accept": "application/octet-stream",
      }
    },
  );
  return {
    encrypted_contents: await response.bytes() as Uint8Array<ArrayBuffer>,
    is_final_download: response.headers.get("X-Final-Download") === "true",
  };
}