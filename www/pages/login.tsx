/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {useEffect, useState} from "react";
import * as StartLogin from "../api/login/start";
import * as FinishLogin from "../api/login/finish";
import * as Session from "../Session";
import * as Base64 from "../Base64";
// Deprecated due to native browser support, but as of 2025-08-28
// Safari 18.6 is the latest stable Safari on MacOS, and hard-crashes
// the tab in credential.toJSON() or JSON.stringify()
import * as WebauthnJSON from "@github/webauthn-json/browser-ponyfill"
import {CredentialRequestOptionsJSON} from "@github/webauthn-json/browser-ponyfill";
import {Link, Navigate, useNavigate, useSearchParams} from "react-router";

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
  challenge.publicKey.extensions.prf = {eval: {first: Base64.decode(server_data.prf_seed)}};
  delete challenge.mediation;
  let credential = await WebauthnJSON.get(challenge as CredentialRequestOptions);
  if (!credential) {
    throw new NoCredentialsError();
  }
  return credential;
}

async function login(setState: (state: States.Any) => void): Promise<void> {
  const setAndThrow = (state: States.Any): never => {
    setState(state);
    throw state;
  };

  setState({state: "requested-challenge"});
  let challenge = null;
  try {
    challenge = await StartLogin.exec();
  } catch (ex) {
    if (ex instanceof Response) {
      setAndThrow({state: "server-error", response: ex});
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
      setAndThrow({state: "no-credentials"});
      return;
    }

    const e = untyped_ex as DOMException;
    switch (e.name) {
      case "NotAllowedError":
        setAndThrow({state: "local-error", message: `Permission denied by browser: "${e.message}"`});
        return;
      default:
        setAndThrow({state: "local-error", message: `Unknown error: ${e.name}: "${e.message}"`});
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
      setAndThrow({state: "server-error", response: ex});
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
}

export default function LoginPage() {
  const [state, setState] = useState<States.Any>({state: "initial"});
  const navigate = useNavigate();
  const [query, setQuery] = useSearchParams();

  useEffect(
    () => {
      const immediate = query.get("requireClick") === null;
      setQuery({});
      if (immediate) {
        login(setState).catch(() => setState({state: "initial"}));
      }
    }, []
  );

  const LoginButton = () => <button onClick={() => {
    login(setState).then(() => navigate("/"));
  }} className={"login-button"}>
    <div className={"login-button-icon"}>🔑</div>
    <div className={"login-button-text"}>
      Login with passkey
    </div>
  </button>;

  const RegisterLink = () =>
    <Link to={"/register"} className={"login-register-link"}>Have a registration code?</Link>;

  switch (state.state) {
    case "initial":
      return <div className={"login-page"}>
        <LoginButton/>
        <RegisterLink/>
      </div>;
    case "prompting-user":
      return <div>Follow your browser prompts.</div>;
    case "requested-challenge":
    case "submitting-challenge-response":
      return <div>Waiting for server...</div>;
    case "complete":
      return <Navigate to={"/"}/>;
    case "server-error":
      return <div className={"login-error"}>
        <p>Something went wrong communicating with the server.</p>
        <LoginButton/>
        <RegisterLink/>
      </div>;
    case "local-error":
      return <div className={"login-error"}>
        <p>Something went wrong on this end: <code>{state.message}</code>.</p>
        <LoginButton/>
        <RegisterLink/>
      </div>;
    case "no-credentials":
      return <div className={"login-error"}>
        <p>Your browser does not have any passkeys saved for this site; you can try again.</p>
        <LoginButton/>
        <RegisterLink/>
      </div>;
  }
}