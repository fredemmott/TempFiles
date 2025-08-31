/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode, useEffect, useRef, useState} from 'react'
import * as Session from '../Session'
import * as ListFiles from '../api/files/list'
import * as DownloadFile from '../api/files/download'
import * as DeleteAllFiles from '../api/files/delete_all'
import {File as APIFile} from '../gen/api/files/File'
import {Navigate, useNavigate} from "react-router";
import * as Base64 from "../Base64";
import * as FileCrypto from "../FileCrypto"
import * as FileUpload from "../FileUpload";

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

interface FileListEntryProps {
  file: APIFile,
  hkdf_keys: HKDFKeys,
}

async function downloadFile(api_file: APIFile, key: CryptoKey, filename: string) {
  const encrypted = await DownloadFile.exec({uuid: api_file.uuid});
  const decrypted = await FileCrypto.decrypt(key, api_file.data_iv, encrypted);
  const url = URL.createObjectURL(new Blob([decrypted]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function FilesListEntry({file, hkdf_keys}: FileListEntryProps): ReactNode {
  type State = "loading" | "loaded" | "no_key" | "requires_e2ee";
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [decryptedFilename, setDecryptedFilename] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      let file_key = null;
      if (file.is_e2ee) {
        if (!hkdf_keys.e2ee_key) {
          setState("requires_e2ee");
          return;
        }
        file_key = await FileCrypto.deriveKey(hkdf_keys.e2ee_key, file.salt);
        setKey(file_key);
      } else {
        file_key = await FileCrypto.deriveKey(hkdf_keys.server_trust_key, file.salt);
        setKey(file_key);
      }
      if (file_key === null) {
        setState("no_key");
        return;
      }
      let decrypted_filename = await FileCrypto.decrypt(file_key, file.filename_iv, file.encrypted_filename);
      setDecryptedFilename(new TextDecoder().decode(decrypted_filename));
    };
    load().then(() => setState("loaded"));
  }, []);

  const createdAt = new Date(Number(file.created_at) * 1000);
  const now = new Date();

  const createdOnDate = new Date(createdAt);
  createdOnDate.setHours(0, 0, 0, 0);
  const nowDate = new Date(now);
  nowDate.setHours(0, 0, 0, 0);

  let time = createdAt.toLocaleTimeString();
  let date = null;
  const dayInMs = 24 * 60 * 60 * 1000;
  if (nowDate.getTime() === createdOnDate.getTime()) {
    date = 'Today';
  } else if (nowDate.getTime() - createdOnDate.getTime() < dayInMs) {
    date = 'Yesterday';
  } else if (nowDate.getTime() - createdOnDate.getTime() < 7 * dayInMs) {
    date = new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(createdAt);
  }

  switch (state) {
    case "loading":
      return <tr>
        <td colSpan={2}>Loading...</td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
    case "requires_e2ee":
      return <tr>
        <td>🔒</td>
        <td>Requires a different passkey</td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
    case "no_key":
      return <tr>
        <td>⚠️</td>
        <td>Unable to derive E2EE key</td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
    case "loaded":
      return <tr>
        {file.is_e2ee ? <td title="File uses E2EE">🔐</td> : <td title="File does not use E2EE">🚨</td>}
        <td>
          <a href="#" onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadFile(
              file,
              key!,
              decryptedFilename!,
            ).catch((ex) => {
              if (ex instanceof Response) {
                alert(`An error occurred downloading a file: ${ex.status} ${ex.statusText}`);
              } else {
                alert(`An error occurred downloading a file: ${ex}`);
              }
            });
          }}>{decryptedFilename}</a></td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
  }
}

interface FilesListProps {
  files: APIFile[],
  hkdfKeys: HKDFKeys | null,
}

function FilesList({files, hkdfKeys}: FilesListProps): ReactNode {
  if (files.length === 0 || hkdfKeys === null) {
    return <div className={"files-list"}>No usable files are available for download.</div>
  }
  files = files.toSorted((a, b) => Number(b.created_at - a.created_at));

  return <div className={"files-list"}>
    <h2>Available Files</h2>
    <table className={"files-list-table"}>
      <tbody>
      {files.map((file) =>
        <FilesListEntry key={Base64.encode(file.salt)} file={file} hkdf_keys={hkdfKeys}/>
      )}
      </tbody>
    </table>
  </div>;
}

async function uploadDroppedFiles(e: React.DragEvent<HTMLDivElement>, hkdfKeys: HKDFKeys): Promise<APIFile[]> {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer.files;
  if (files.length === 0) {
    return [];
  }
  return await FileUpload.multipleFiles(files, hkdfKeys);
}

interface FilePickerProps {
  hkdfKeys: HKDFKeys | null,
  onUpload: (files: APIFile[]) => void,
}

function FilePicker({hkdfKeys, onUpload}: FilePickerProps): ReactNode {
  if (hkdfKeys === null) {
    return <div className={"file-picker"}>
      <div className="file-picker-content">
        <div className={"file-picker-icon"}>⏳</div>
        <div className={"file-picker-text"}>Loading keys...</div>
      </div>
    </div>;
  }

  const [isDragOver, setIsDragOver] = useState(false);

  const preventDefault = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const input =
    <input
      ref={inputRef}
      type="file"
      hidden
      onChange={(e) => {
        preventDefault(e);
        const files = e.target.files;
        if (files === null) {
          return;
        }
        FileUpload.multipleFiles(files, hkdfKeys).then(onUpload);
      }}
    />;

  const containerRef = useRef<HTMLDivElement>(null);
  return <div
    className={`file-picker ${isDragOver ? "drag-over" : ""}`}
    ref={containerRef}
    onDragEnter={(e) => {
      preventDefault(e);
      setIsDragOver(true);
    }}
    onDragOver={preventDefault}
    onDragLeave={(e) => {
      preventDefault(e);
      if (e.currentTarget == containerRef.current) {
        setIsDragOver(false);
      }
    }}
    onDrop={(e) => {
      uploadDroppedFiles(e, hkdfKeys).then(onUpload);
      setIsDragOver(false);
    }}
    onClick={() => {
      if (inputRef.current) {
        inputRef.current.click();
      }
    }}
  >
    <div className="file-picker-content" style={{pointerEvents: "none"}}>
      <div className={"file-picker-icon"}>📂</div>
      <div className={"file-picker-text"}>drop files or click to upload</div>
      {input}
    </div>
  </div>;
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
    <FilesList files={files} hkdfKeys={hkdfKeys}/>
    <div className={"footer"}>
      Powered by {' '}
      <a href="https://github.com/fredemmott/TempFiles">
        TempFiles
      </a>
    </div>
  </div>;
}