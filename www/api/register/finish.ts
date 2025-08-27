import {ApiRegisterFinishRequest} from "../../gen/ApiRegisterFinishRequest"
import {ApiRegisterFinishResponse} from "../../gen/ApiRegisterFinishResponse"

export type {ApiRegisterFinishRequest as Request, ApiRegisterFinishResponse as Response}

export async function exec(request: ApiRegisterFinishRequest): Promise<ApiRegisterFinishResponse> {
  const endpoint = "/api/register/finish";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}
