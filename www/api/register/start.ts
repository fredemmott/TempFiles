import {ApiRegisterStartRequest} from "../../gen/ApiRegisterStartRequest"
import {ApiRegisterStartResponse} from "../../gen/ApiRegisterStartResponse"

export type {ApiRegisterStartRequest as Request, ApiRegisterStartResponse as Response}

export async function exec(request: ApiRegisterStartRequest): Promise<ApiRegisterStartResponse> {
  const endpoint = "/api/register/start";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}