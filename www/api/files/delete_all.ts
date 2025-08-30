import * as Session from "../../Session";
import base64_decode from "../../base64_decode";
import base64_encode from "../../base64_encode";

export async function exec(): Promise<void> {
  const endpoint = "/api/files/delete_all";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {"Authorization": `Bearer ${Session.token()}`},
  });
  if (!response.ok) {
    throw response;
  }
}