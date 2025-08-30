import * as APICall from "../APICall";

export async function exec(): Promise<void> {
  await APICall.authenticated("/api/files/delete_all");
}