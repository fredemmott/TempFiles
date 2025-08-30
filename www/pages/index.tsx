import React, {ReactNode, useEffect, useRef, useState} from 'react'
import * as Session from '../Session'
import * as ListFiles from '../api/files/list'
import * as UploadFile from '../api/files/upload'
import * as DownloadFile from '../api/files/download'
import * as DeleteAllFiles from '../api/files/delete_all'
import {File as APIFile} from '../gen/api/files/File'
import {Navigate} from "react-router";
import {CONFIG} from "../gen/site-config"
import base64_encode from "../base64_encode";

const DEBUG_CRYPTO_SECRETS = false;
const EXTRACTABLE_CRYPTO_KEYS = DEBUG_CRYPTO_SECRETS;

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
  const decrypted = await decrypt(key, api_file.data_iv, encrypted);
  const url = URL.createObjectURL(new Blob([decrypted]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function decrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("decrypting", {
      key: base64_encode(new Uint8Array(exported_key)),
      iv: base64_encode(iv),
      data
    });
  }
  return new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  ));
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
        file_key = await genCryptoKeyForFile(hkdf_keys.e2ee_key, file.salt);
        setKey(file_key);
      } else {
        file_key = await genCryptoKeyForFile(hkdf_keys.server_trust_key, file.salt);
        setKey(file_key);
      }
      if (file_key === null) {
        setState("no_key");
        return;
      }
      let decrypted_filename = await decrypt(file_key, file.filename_iv, file.encrypted_filename);
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
          <a href="" onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadFile(
              file,
              key!,
              decryptedFilename!,
            );
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
    return <div>No usable files are available for download.</div>
  }
  files = files.toSorted((a, b) => Number(b.created_at - a.created_at));

  return <div className={"files-list"}>
    <table>
      <tbody>
      {files.map((file) =>
        <FilesListEntry key={base64_encode(file.salt)} file={file} hkdf_keys={hkdfKeys}/>
      )}
      </tbody>
    </table>
  </div>;
}

interface HKDFKeys {
  e2ee_key: CryptoKey | null,
  server_trust_key: CryptoKey,
}

async function getHKDFKeys(): Promise<HKDFKeys> {
  let [e2ee_key, server_trust_key] = [
    await Session.e2ee_hkdf_key(),
    await Session.server_trust_hkdf_key(),
  ];
  return {
    e2ee_key,
    server_trust_key,
  };
}

interface CryptoParams {
  salt: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
  filename_iv: Uint8Array<ArrayBuffer>,
  data_iv: Uint8Array<ArrayBuffer>,
}

async function genCryptoKeyForFile(hkdf_key: CryptoKey, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const params: HkdfParams = {
    name: "HKDF",
    hash: "SHA-256",
    salt: salt,
    info: encoder.encode("user-file"),
  };
  const key = await crypto.subtle.deriveKey(
    params,
    hkdf_key,
    {name: "AES-GCM", length: 128},
    EXTRACTABLE_CRYPTO_KEYS,
    ["encrypt", "decrypt"],
  );
  if (DEBUG_CRYPTO_SECRETS) {
    console.log("Generated per-file key", {
      salt: base64_encode(salt),
      key: base64_encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
    });
  }
  return key;
}

async function genCryptoParamsForUpload(hkdf_key: CryptoKey): Promise<CryptoParams> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await genCryptoKeyForFile(hkdf_key, salt);
  return {
    salt,
    key,
    filename_iv: crypto.getRandomValues(new Uint8Array(12)),
    data_iv: crypto.getRandomValues(new Uint8Array(12)),
  };
}

async function encrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("encrypting", {
      key: base64_encode(new Uint8Array(exported_key)),
      iv: base64_encode(iv),
    });
  }

  return new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  ));
}

async function encryptSingleFile(file: File, hkdf_keys: HKDFKeys | null = null): Promise<APIFile> {
  if (hkdf_keys === null) {
    hkdf_keys = await getHKDFKeys();
  }
  let is_e2ee = true;
  let hkdf_key = hkdf_keys.e2ee_key;
  if (hkdf_key === null) {
    is_e2ee = false;
    hkdf_key = hkdf_keys.server_trust_key;
  }

  const crypto_params = await genCryptoParamsForUpload(hkdf_key);
  if (DEBUG_CRYPTO_SECRETS) {
    console.log({
      filename_iv: base64_encode(crypto_params.filename_iv),
      data_iv: base64_encode(crypto_params.data_iv),
    });
  }
  const encrypted_filename = await encrypt(
    crypto_params.key,
    crypto_params.filename_iv,
    new TextEncoder().encode(file.name),
  );
  const unencrypted_data = new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  }));

  const encrypted_data = await encrypt(
    crypto_params.key,
    crypto_params.data_iv,
    unencrypted_data,
  );

  const request: UploadFile.Request = {
    is_e2ee,
    salt: crypto_params.salt,
    filename_iv: crypto_params.filename_iv,
    data_iv: crypto_params.data_iv,
    encrypted_filename,
    encrypted_data,
  }
  const response: UploadFile.Response = await UploadFile.exec(request);
  return response.file;
}

async function handleFiles(files: FileList) {
  const hkdf_keys = await getHKDFKeys();
  try {
    return await Promise.all(Array.from(files).map((file) => encryptSingleFile(file, hkdf_keys)));
  } catch (e) {
    if (e instanceof Response) {
      alert(`An error occurred uploading a file to the server: ${e.status} ${e.statusText}`);
      window.location.reload();
    }
    throw e;
  }
}

async function uploadDroppedFiles(e: React.DragEvent<HTMLDivElement>): Promise<APIFile[]> {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer.files;
  if (files.length === 0) {
    return [];
  }
  return await handleFiles(files);
}

interface FilePickerProps {
  onUpload: (files: APIFile[]) => void,
}

function FilePicker({onUpload}: FilePickerProps): ReactNode {
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
        handleFiles(files).then(onUpload);
      }}
    />;

  const containerRef = useRef<HTMLDivElement>(null);

  return <div
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
      uploadDroppedFiles(e).then(onUpload);
      setIsDragOver(false);
    }}
    onClick={() => {
      if (inputRef.current) {
        inputRef.current.click();
      }
    }}
    className={`file-picker ${isDragOver ? "drag-over" : ""}`}
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

  useEffect(() => {
    getHKDFKeys().then(setHKDFKeys);
    ListFiles.exec().then((response) => setFiles(response.files));
  }, []);

  return <>
    <h1>{CONFIG.title}</h1>
    <div className={"header"}>
      <E2EEWarning/>
      <a href="" onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm("Are you sure you want to delete all files?")) {
          return;
        }

        DeleteAllFiles.exec().then(() => {
          setFiles([]);
        });
      }}>🗑️ Delete all files</a>
    </div>
    <FilesList files={files} hkdfKeys={hkdfKeys}/>
    <FilePicker onUpload={(newFiles) =>
      setFiles([...files, ...newFiles])
    }/>
  </>;
}