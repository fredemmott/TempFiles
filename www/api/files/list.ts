import {ListRequest} from "../../gen/api/files/ListRequest";
import {ListResponse} from "../../gen/api/files/ListResponse";

export type {ListRequest as Request, ListResponse as Response}

export async function exec(request: ListRequest): Promise<ListResponse> {
  const endpoint = "/api/files/list";
  const response = await fetch(endpoint, {method: "POST", body: JSON.stringify(request)});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}