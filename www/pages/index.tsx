import React, {ReactNode, useEffect, useState} from 'react'
import * as Session from '../Session'
import * as ListFiles from '../api/files/list'
import * as UploadFile from '../api/files/upload'
import {File as APIFile} from '../gen/api/files/File'
import {Navigate} from "react-router";
import {CONFIG} from "../gen/site-config"

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

async function fetch_files_list(setFiles: (files: Array<APIFile>) => void) {
  let response = await ListFiles.exec({
    ...Session.api_credentials(),
  });
  setFiles(response.files);
}

interface FileListEntryProps {
  file: APIFile,
  hkdf_keys: HKDFKeys,
}

function FilesListEntry({file, hkdf_keys}: FileListEntryProps): ReactNode {
  type State = "loading" | "loaded" | "no_key" | "requires_e2ee";
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [decryptedFilename, setDecryptedFilename] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      let salt = a_to_uint8array(file.salt);
      let file_key = null;
      if (file.is_e2ee) {
        if (!hkdf_keys.e2ee_key) {
          setState("requires_e2ee");
          return;
        }
        file_key = await genCryptoKeyForFile(hkdf_keys.e2ee_key, salt);
        setKey(file_key);
      } else {
        file_key = await genCryptoKeyForFile(hkdf_keys.server_trust_key, salt);
        setKey(file_key);
      }
      if (file_key === null) {
        setState("no_key");
        return;
      }
      let decrypted_filename = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: a_to_buffersource(file.filename_iv),
        },
        file_key,
        a_to_buffersource(file.encrypted_filename),
      );
      setDecryptedFilename(new TextDecoder().decode(decrypted_filename));
      setState("loaded");
    };
    load();
    return () => {
    };
  }, []);

  switch (state) {
    case "loading":
      return <div>Loading...</div>;
    case "requires_e2ee":
      return <div>E2EE-encrypted file, but couldn't derive E2EE seed.</div>;
    case "no_key":
      return <div>Couldn't derive decryption key</div>;
    case "loaded":
      return <div>
        {file.is_e2ee ? <span title="File uses E2EE">🔐</span> : <span title="File does not use E2EE">🚨</span>}
        {decryptedFilename} at {file.created_at}</div>
  }
}

function FilesList(): ReactNode {
  const [files, setFiles] = useState<Array<APIFile>>([]);
  const [hkdfKeys, setHKDFKeys] = useState<HKDFKeys | null>(null);
  useEffect(() => {
    let load_and_set_keys = async () => {
      setHKDFKeys(await getHKDFKeys());
    };
    fetch_files_list(setFiles);
    load_and_set_keys();
    return () => {
    };
  }, []);

  if (files.length === 0 || hkdfKeys === null) {
    return <div>No usable files are available for download.</div>
  }
  return <div>{files.map((file, index) =>
    <FilesListEntry key={index} file={file} hkdf_keys={hkdfKeys}/>
  )}</div>

  return <div>TODO: list files (got {files.length})</div>;
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
  salt: Uint8Array,
  key: CryptoKey,
  filename_iv: Uint8Array,
  data_iv: Uint8Array,
}

async function genCryptoKeyForFile(hkdf_key: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const params: HkdfParams = {
    name: "HKDF",
    hash: "SHA-256",
    salt: a_to_buffersource(salt),
    info: encoder.encode("user-file"),
  };
  return await crypto.subtle.deriveKey(
    params,
    hkdf_key,
    {name: "AES-GCM", length: 128},
    false,
    ["encrypt", "decrypt"],
  );
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

type BinaryData = ArrayBuffer | Uint8Array | string;

function a_to_uint8array(data: BinaryData): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') {
    return Uint8Array.from(data, c => c.charCodeAt(0));
  }
  return new Uint8Array(data);
}

function a_to_binary_string(data: BinaryData): string {
  return Array.from(
    a_to_uint8array(data),
    (byte) => String.fromCharCode(byte)
  ).join('');
}

function a_to_blob(data: BinaryData): Blob {
  return new Blob([a_to_binary_string(data)]);
}

function a_to_buffersource(data: BinaryData): BufferSource {
  return a_to_uint8array(data).buffer;
}

interface HKDFKey {
  kind: 'e2ee' | 'server-trust',
  key: CryptoKey,
}

async function encryptSingleFile(file: File, hkdf_keys: HKDFKeys | null = null) {
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
  const encrypted_filename = a_to_binary_string(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: a_to_buffersource(crypto_params.filename_iv),
    },
    crypto_params.key,
    new TextEncoder().encode(file.name),
  ));
  const unencrypted_data: ArrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const encrypted_data = a_to_blob(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: a_to_buffersource(crypto_params.data_iv),
    },
    crypto_params.key,
    unencrypted_data,
  ))

  const request: UploadFile.Request = {
    is_e2ee,
    salt: a_to_binary_string(crypto_params.salt),
    filename_iv: a_to_binary_string(crypto_params.filename_iv),
    data_iv: a_to_binary_string(crypto_params.data_iv),
    encrypted_filename: encrypted_filename,
    encrypted_data: encrypted_data,
    ...Session.api_credentials()
  }
  const response = await UploadFile.exec(request);

  debugger;
}

async function handleFiles(files: FileList) {
  const hkdf_keys = await getHKDFKeys();
  for (const file of files) {
    encryptSingleFile(file, hkdf_keys);
  }
}

function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer.files;
  if (files.length === 0) {
    return;
  }
  handleFiles(files);
}

function FilePicker(): ReactNode {
  const input = <input type="file" hidden/>;

  const preventDefault = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return <div
    onDragEnter={preventDefault}
    onDragOver={preventDefault}
    onDragLeave={preventDefault}
    onDrop={handleDrop}
    style={{
      border: "1px solid #ccc",
      padding: "1em",
    }}
  >
    <p>Drag & Drop your files here</p>
    {input}
  </div>;
}

export default function IndexPage(): ReactNode {
  if (!Session.is_logged_in()) {
    return <Navigate to="/login"/>;
  }

  return <>
    <h1>{CONFIG.title}</h1>
    <E2EEWarning/>
    <FilesList/>
    <FilePicker/>
  </>;
}