import * as Session from "../Session";

export async function unauthenticated(
  uri: string,
  options: RequestInit = {}): Promise<Response> {
  const response = await fetch(uri, options);
  if (!response.ok) {
    throw response;
  }
  return response;
}

export async function authenticated(
  uri: string,
  options: RequestInit = {}): Promise<Response> {
  options = {
    method: "POST",
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${Session.token()}`,
    }
  }
  try {
    return await unauthenticated(uri, options);
  } catch (e) {
    if (e instanceof Response) {
      switch (e.status) {
        case 401: // not authorized
          alert("Your session has expired; please log in again.");
          window.location.href = "/login";
          break;
      }
    }
    throw e;
  }
}

export async function authenticated_json(uri: string, options: RequestInit = {}): Promise<any> {
  const response = await authenticated(uri, options);
  return await response.json();
}