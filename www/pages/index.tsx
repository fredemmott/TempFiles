import React, {ReactNode} from 'react'
import * as Session from '../Session'
import {Navigate} from "react-router";
import {CONFIG} from "../gen/site-config";

function E2EEWarning(): ReactNode {
  if (Session.supports_e2ee()) {
    return <div>✅ End-to-end encryption (E2EE) is active</div>
  }
  return <div style={{borderColor: "red", borderWidth: "3px", borderStyle: "solid"}}>
    <h2>🚨 E2EE is not supported 🚨</h2>
    <p>
      End-to-end encryption is not supported by the combination of your passkey, browser, and operating system.
    </p>
    <p>
      You can still use this tool to share files without E2EE, and to download files that were also uploaded
      without E2EE.
    </p>
    <details>
      <summary>Show details</summary>
      This tool uses the WebAuthn <code>prf</code> extension to support end-to-end encryption.
      The <code>prf</code> extension is not currently available.
    </details>
  </div>
}

export default function () {
  if (!Session.is_logged_in()) {
    return <Navigate to="/login"/>;
  }
  return <>
    <h1>{CONFIG.title}</h1>
    <E2EEWarning/>
  </>;
}