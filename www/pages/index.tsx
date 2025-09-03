/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode, useEffect, useState} from 'react'
import * as Session from '../Session'
import * as ListFiles from '../api/files/list'
import * as DeleteAllFiles from '../api/files/delete_all'
import PendingFilesList from "../components/PendingFilesList"
import APIFile from '../api/files/File'
import {Navigate, useNavigate} from "react-router";
import * as FileCrypto from "../FileCrypto"
import FilesList from "../components/FilesList";
import FilePicker from "../components/FilePicker";
import PendingFile from "../PendingFile";

type HKDFKeys = FileCrypto.HKDFKeys;

function E2EEWarning(): ReactNode {
  if (Session.isE2EESupported()) {
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
  if (!Session.isLoggedIn()) {
    return <Navigate to="/login"/>;
  }
  const [files, setFiles] = useState<APIFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [hkdfKeys, setHKDFKeys] = useState<HKDFKeys | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    FileCrypto.getHKDFKeys().then(setHKDFKeys);
    ListFiles.exec().then((response) => setFiles(response.files));
  }, []);

  if (!hkdfKeys) {
    return <div className={"index-page index-page-loading"}>
      <div className={"index-page-loading-icon"}>⏳</div>
      <div className={"index-page-loading-text"}>Loading...</div>
    </div>;
  }

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
      onFilesPicked={
        (pickedFiles) => {
          const added: PendingFile[] = pickedFiles.map((file) => {
            const uuid = crypto.randomUUID();
            const metadata: PendingFile = {
              uuid,
              fileName: file.name,
              encryptedFile: null,
            };

            FileCrypto.encrypt(file, hkdfKeys).then(
              (encryptedFile) =>
                setPendingFiles((prev) => prev.map(
                  (it: PendingFile) => {
                    if (it.uuid !== uuid) {
                      return it;
                    }
                    return {
                      ...it,
                      encryptedFile,
                    };
                  }
                )));

            return metadata;
          });
          setPendingFiles((prev) => [...prev, ...added]);
        }}
    />
    <PendingFilesList
      files={pendingFiles}
      onUpload={(file) => {
        setFiles((prev) => [file, ...prev]);
        setPendingFiles((prev) => prev.filter((it) => it.uuid !== file.uuid));
      }}
    />
    <FilesList
      files={files}
      hkdfKeys={hkdfKeys}
      onDelete={(uuid) =>
        setFiles(files.filter((file) => file.uuid !== uuid))
      }
    />
    <div className={"footer"}>
      Powered by {' '}
      <a href="https://github.com/fredemmott/TempFiles">
        TempFiles
      </a>
    </div>
  </div>;
}