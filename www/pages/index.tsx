/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode, useEffect, useState} from 'react'
import * as Session from '../Session'
import * as ListFiles from '../api/files/list'
import * as DeleteAllFiles from '../api/files/delete_all'
import {File as APIFile} from '../api/files/File'
import {Navigate, useNavigate} from "react-router";
import * as FileCrypto from "../FileCrypto"
import FilesList from "../components/FilesList";
import FilePicker from "../components/FilePicker";

type HKDFKeys = FileCrypto.HKDFKeys;

function E2EEWarning(): ReactNode {
  if (Session.supports_e2ee()) {
    return <div>✅ End-to-end encryption (E2EE) is active</div>
  }
  return <div style={{borderColor: "red", borderWidth: "3px", borderStyle: "solid"}}>
    <h2>🚨 E2EE is not available 🚨</h2>
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


export default function IndexPage(): ReactNode {
  if (!Session.is_logged_in()) {
    return <Navigate to="/login"/>;
  }
  const [files, setFiles] = useState<APIFile[]>([]);
  const [hkdfKeys, setHKDFKeys] = useState<HKDFKeys | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    FileCrypto.getHKDFKeys().then(setHKDFKeys);
    ListFiles.exec().then((response) => setFiles(response.files));
  }, []);

  return <div className={"index-page"}>
    <div className={"header"}>
      <E2EEWarning/>
      <div>
        {"🗑️ "}
        <a href="#" onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();

          if (!window.confirm("Are you sure you want to delete all files?")) {
            return;
          }

          DeleteAllFiles.exec().then(() => {
            setFiles([]);
          });
        }}>Delete all files</a>
      </div>
      <div>
        {"🔌 "}
        <a href="#" onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          Session.clear();
          navigate("/login?requireClick");
        }}>Logout</a>
      </div>
    </div>
    <FilePicker
      hkdfKeys={hkdfKeys}
      onUpload={(newFiles) =>
        setFiles([...files, ...newFiles])
      }/>
    <FilesList
      files={files}
      hkdfKeys={hkdfKeys}
      onDelete={(uuid) =>
        setFiles(files.filter((file) => file.uuid !== uuid))
      }/>
    <div className={"footer"}>
      Powered by {' '}
      <a href="https://github.com/fredemmott/TempFiles">
        TempFiles
      </a>
    </div>
  </div>;
}