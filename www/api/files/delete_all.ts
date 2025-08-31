/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import * as APICall from "../APICall";

export async function exec(): Promise<void> {
  await APICall.authenticated("/api/files/delete_all");
}