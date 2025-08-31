/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {StartRequest} from "../../gen/api/register/StartRequest"
import {StartResponse} from "../../gen/api/register/StartResponse"

export type {StartRequest as Request, StartResponse as Response}

export async function exec(request: StartRequest): Promise<StartResponse> {
  const endpoint = "/api/register/start";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}