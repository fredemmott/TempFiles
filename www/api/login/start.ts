import {StartResponse} from "../../gen/api/login/StartResponse"

export type {StartResponse as Response}

export async function exec(): Promise<StartResponse> {
  const endpoint = "/api/login/start";
  const response = await fetch(endpoint, {method: "POST"});
  if (!response.ok) {
    throw response;
  }
  return await response.json();
}