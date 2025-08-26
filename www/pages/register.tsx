import React from "react";
import {useState, useEffect} from "react";
import RegisterAPI from "../api/register";
import {Challenge} from "../api/register";

namespace States {
  export interface Initial {
    state: "initial";
  }

  export interface RequestedChallenge {
    state: "requested-challenge";
  }

  export interface PromptingUser {
    state: "prompting-user";
    challenge: Challenge,
  }

  export type Any = Initial | RequestedChallenge | PromptingUser;
}

async function register(challenge: Challenge) {
  const payload = {
    publicKey: {
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        userVerification: "discouraged",
        residentKey: "required",
      },
      challenge: challenge.challenge,
      rp: {
        name: "Fred's TempFiles Tool",
        id: "localhost",
      },
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7,
        }
      ],
      timeout: 30000,
      user: {
        name: "fred",
        displayName: "fred",
        id: user_id,
      },
      hints: ["hybrid"],
      extensions: {
        prf: {
          eval: {first: e2e_seed},
        }
      }
    }
  };
}

export default function RegistrationPage() {
  const [state, setState] = useState<States.Any>({state: "initial"});
  useEffect(() => {
    let cancelled = false;
    const register = async () => {
      setState({state: "requested-challenge"});
      const challenge = await RegisterAPI.start();
      setState({state: "prompting-user", challenge});
    };
    register();
    return () => {
      cancelled = true;
    };
  }, [/* no dependencies, only run once, when component is mounted */]);

  switch (state.state) {
    case "initial":
      return <div>Waiting for React...</div>;
    case "requested-challenge":
      return <div>Waiting for server...</div>;
    case "prompting-user":
      return <div>Follow your browser prompts to register your passkey.</div>;
  }
}