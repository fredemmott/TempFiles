import React from "react";
import {useState, useEffect} from "react";
import * as StartRegistration from "../api/register/start";
import {useSearchParams} from "react-router";
import {CONFIG} from "../gen/site-config";

async function create_credential(server_data: StartRegistration.Response) {
  const payload: CredentialCreationOptions = {
    publicKey: {
      attestation: "direct",
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        userVerification: "discouraged",
        residentKey: "required",
      },
      challenge: new Uint8Array(server_data.challenge),
      rp: {
        name: CONFIG.title,
        id: CONFIG.rp_id,
      },
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7,
        }
      ],
      timeout: 30000,
      user: {
        name: server_data.username,
        displayName: server_data.username,
        id: new TextEncoder().encode(server_data.user_uuid),
      },
      extensions: {prf: {}},
      // @ts-ignore new feature
      hints: ["hybrid"],
    }
  };
  return await navigator.credentials.create(payload);
}

async function register(token: string, setState: (state: States.Any) => void): Promise<void> {
  setState({state: "requested-challenge"});
  let response = null;
  try {
    response = await StartRegistration.exec({token});
  } catch (ex) {
    if (ex instanceof Response) {
      if (ex.status === 404) {
        setState({state: "invalid-token"});
      } else {
        setState({state: "server-error", response: ex});
      }
      return;
    }
    throw ex;
  }
  setState({state: "prompting-user", server_data: response});
  let credential: Credential | null = null;
  try {
    credential = await create_credential(response);
  } catch (untyped_ex) {
    const e = untyped_ex as DOMException;
    switch (e.name) {
      case "AbortError":
        setState({state: "local-error", message: "Cancelled by user"});
        return;
      case "NotAllowedError":
        setState({state: "local-error", message: `Permission denied by browser: "${e.message}"`});
        return;
    }
  }
}

namespace States {
  export interface Initial {
    state: "initial";
  }

  export interface RequestedChallenge {
    state: "requested-challenge";
  }

  export interface PromptingUser {
    state: "prompting-user";
    server_data: StartRegistration.Response,
  }

  export interface LocalError {
    state: "local-error";
    message: string;
  }

  export interface ServerError {
    state: "server-error";
    response: Response;
  }

  export interface InvalidToken {
    state: "invalid-token";
  }

  export type Any = Initial | RequestedChallenge | PromptingUser | LocalError | ServerError | InvalidToken;
}

export default function RegistrationPage() {
  const [state, setState] = useState<States.Any>({state: "initial"});
  const [searchParams, _] = useSearchParams();
  let token = searchParams.get("t")!

  useEffect(() => {
    let cancelled = false;
    register(token, setState);
    return () => {
      cancelled = true;
    };
  }, [/* no dependencies, only run once, when the component is mounted */]);

  switch (state.state) {
    case "initial":
      return <div>Waiting for React...</div>;
    case "requested-challenge":
      return <div>Waiting for server...</div>;
    case "prompting-user":
      return <div>Follow your browser prompts to register your passkey.</div>;
    case "local-error":
      return <div>
        Something went wrong on this end: {state.message}.
        <br/>
        <button onClick={() => register(token, setState)}>Try again</button>
      </div>;
    case "invalid-token":
      return <div>
        The registration token is invalid or expired; you will need to generate a new registration link.
      </div>;
    case "server-error":
      return <div>
        The server returned an error: {state.response.status} {state.response.statusText}.
        <br/>
        <button onClick={() => register(token, setState)}>Try again</button>
      </div>;
  }
}