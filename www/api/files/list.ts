/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {ListResponse as ServerResponse} from "../../gen/api/files/ListResponse";
import {File as APIFile} from "./File";
import * as APICall from "../APICall";

interface Response {
  files: APIFile[],
}

export async function exec(): Promise<Response> {
  const body: ServerResponse = await APICall.authenticatedJSON("/api/files/list");
  return {
    files: body.files.map((f) => new APIFile(f)),
  };
}