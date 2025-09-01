/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {DeleteRequest} from "../../gen/api/files/DeleteRequest";
import * as APICall from "../APICall";

export async function exec(request: DeleteRequest): Promise<void> {
  await APICall.authenticated(
    "/api/files/delete",
    {
      body: JSON.stringify(request),
    },
  );
}