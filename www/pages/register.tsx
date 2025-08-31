/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {useRef} from "react";
import {useState} from "react";
import {Link, useSearchParams} from "react-router";
import * as StartRegistration from "../api/register/start";
import * as FinishRegistration from "../api/register/finish";
import * as Base64 from "../Base64";

async function create_credential(server_data: StartRegistration.Response) {
  let challenge = server_data.challenge as any;
  challenge.publicKey.user.id = Base64.decode(challenge.publicKey.user.id);
  challenge.publicKey.challenge = Base64.decode(challenge.publicKey.challenge);
  challenge.publicKey.hints = ["hybrid"];
  challenge.publicKey.extensions = {prf: {}};
  challenge.publicKey.authenticatorSelection = {
    authenticatorAttachment: "cross-platform",
    userVerification: "discouraged",
    residentKey: "required",
  };
  return await navigator.credentials.create(challenge as CredentialCreationOptions);
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
      default:
        setState({state: "local-error", message: `Unknown error: ${e.name}: "${e.message}"`});
        return;
    }
  }

  setState({state: "submitting-challenge-response"});
  await FinishRegistration.exec({
    token,
    credential,
    challenge_uuid: response.challenge_uuid,
  });
  setState({state: "registered"});
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

  export interface SubmittingChallengeResponse {
    state: "submitting-challenge-response";
  }

  export interface Registered {
    state: "registered";
  }

  export interface LocalError {
    state: "local-error";
    message: string;
  }

  export interface ServerError {
    state: "server-error";
    response: Response;
  }

  export interface InvalidTokenError {
    state: "invalid-token";
  }

  export type Any =
    Initial
    | RequestedChallenge
    | PromptingUser
    | SubmittingChallengeResponse
    | Registered
    | LocalError
    | ServerError
    | InvalidTokenError;
}

export default function RegistrationPage() {
  const [state, setState] = useState<States.Any>({state: "initial"});

  const RegistrationForm = () => {
    let inputRef = useRef<HTMLInputElement>(null);
    return <form className={"registration-form"}>
      <input
        name={"token"}
        type={"text"}
        ref={inputRef}
        size={96}
        aria-description={"Registration token"}
        placeholder={"Registration token"}/>
      <button onClick={() => register(inputRef.current!.value, setState)} type={"submit"}>Add Passkey</button>
    </form>
  };

  switch (state.state) {
    case "initial":
      return <>
        <div>
          Let's get started! It is <em>strongly</em> recommended that you use your phone as your passkey,
          because for end-to-end encryption on other devices varies depending on the hardware, operating system,
          and browser.
        </div>
        <RegistrationForm/>
      </>;
    case "submitting-challenge-response":
      return <div>Waiting for server...</div>;
    case "prompting-user":
      return <div>Follow your browser prompts to register your passkey.</div>;
    case "registered":
      return <div>Your passkey has been registered! You can now <Link to="/login">login</Link>.</div>
    case "local-error":
      return <div>
        Something went wrong on this end: {state.message}.
        <br/>
        <RegistrationForm/>
      </div>;
    case "invalid-token":
      return <div>
        The registration token is invalid or expired; you will need to generate a new registration link.
        <br/>
        <RegistrationForm/>
      </div>;
    case "server-error":
      return <div>
        The server returned an error: {state.response.status} {state.response.statusText}.
        <br/>
        <RegistrationForm/>
      </div>;
  }
}