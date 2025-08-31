/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {FinishRequest} from "../../gen/api/login/FinishRequest"
import {FinishResponse} from "../../gen/api/login/FinishResponse"

export type {FinishRequest as Request, FinishResponse as Response}

export async function exec(request: FinishRequest): Promise<FinishResponse> {
  const endpoint = "/api/login/finish";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}
