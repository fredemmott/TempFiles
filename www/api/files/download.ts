/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {DownloadRequest} from "../../gen/api/files/DownloadRequest";
import * as APICall from "../APICall";

export type {DownloadRequest as Request}

export async function exec(request: DownloadRequest): Promise<Uint8Array<ArrayBuffer>> {
  const response = await APICall.authenticated(
    "/api/files/download",
    {
      body: JSON.stringify(request),
      headers: {
        "Accept": "application/octet-stream",
      }
    },
  );
  return await response.bytes() as Uint8Array<ArrayBuffer>;
}