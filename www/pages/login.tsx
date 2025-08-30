import React, {useState} from "react";
import * as StartLogin from "../api/login/start";
import * as FinishLogin from "../api/login/finish";
import * as Session from "../Session";
import base64_decode from "../base64_decode";
// Deprecated due to native browser support, but as of 2025-08-28
// Safari 18.6 is the latest stable Safari on MacOS, and hard-crashes
// the tab in credential.toJSON() or JSON.stringify()
import * as WebauthnJSON from "@github/webauthn-json/browser-ponyfill"
import {CredentialRequestOptionsJSON} from "@github/webauthn-json/browser-ponyfill";
import {NavigateFunction, useNavigate} from "react-router";

namespace States {
  export interface Initial {
    state: "initial";
  }

  export interface RequestedChallenge {
    state: "requested-challenge";
  }

  export interface PromptingUser {
    state: "prompting-user";
    server_data: StartLogin.Response,
  }

  export interface SubmittingChallengeResponse {
    state: "submitting-challenge-response";
  }

  export interface Complete {
    state: "complete";
  }

  export interface ServerError {
    state: "server-error";
    response: Response;
  }

  export interface LocalError {
    state: "local-error";
    message: string;
  }

  export interface NoCredentials {
    state: "no-credentials";
  }

  export type Any =
    Initial
    | RequestedChallenge
    | PromptingUser
    | SubmittingChallengeResponse
    | Complete
    | ServerError
    | LocalError
    | NoCredentials;
}

class NoCredentialsError extends Error {
}

async function get_credential(server_data: StartLogin.Response): Promise<PublicKeyCredential> {
  let challenge: any = WebauthnJSON.parseRequestOptionsFromJSON(server_data.challenge as CredentialRequestOptionsJSON);
  challenge.publicKey.extensions.prf = {eval: {first: base64_decode(server_data.prf_seed)}};
  delete challenge.mediation;
  let credential = await WebauthnJSON.get(challenge as CredentialRequestOptions);
  if (!credential) {
    throw new NoCredentialsError();
  }
  return credential;
}

async function login(setState: (state: States.Any) => void, navigate: NavigateFunction): Promise<void> {
  setState({state: "requested-challenge"});
  let challenge = null;
  try {
    challenge = await StartLogin.exec();
  } catch (ex) {
    if (ex instanceof Response) {
      setState({state: "server-error", response: ex});
      return;
    }
    throw ex;
  }
  setState({state: "prompting-user", server_data: challenge});
  let credential = null;
  try {
    credential = await get_credential(challenge);
  } catch (untyped_ex) {
    if (untyped_ex instanceof NoCredentialsError) {
      setState({state: "no-credentials"});
      return;
    }

    const e = untyped_ex as DOMException;
    switch (e.name) {
      case "AbortError":
        setState({state: "local-error", message: "Cancelled by user"});
        return;
      case "NotAllowedError":
        setState({state: "local-error", message: `Permission denied by browser: "${e.message}"`});
        return;
      default:
        setState({state: "local-error", message: `Unknown error: ${e.name}: "${e.message}"`});
        return;
    }
  }
  setState({state: "submitting-challenge-response"});
  let result = null;
  try {
    result = await FinishLogin.exec({
      challenge_uuid: challenge.challenge_uuid,
      credential,
    });
  } catch (ex) {
    if (ex instanceof Response) {
      setState({state: "server-error", response: ex});
      return;
    }
    throw ex;
  }

  Session.initialize({
    session: result.session,
    username: result.username,
    server_prf_seed: challenge.prf_seed,
    credential,
  });

  setState({state: "complete"});
  navigate("/");
}

export default function LoginPage() {
  const [state, setState] = useState<States.Any>({state: "initial"});
  const navigate = useNavigate();

  switch (state.state) {
    case "initial":
      return <button onClick={() => login(setState, navigate)}>Login</button>;
    case "requested-challenge":
      return <div>Waiting for server...</div>;
    default:
      return <>
        <div>State:</div>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </>;
  }
}