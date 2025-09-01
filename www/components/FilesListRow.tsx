/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {File as APIFile} from "../api/files/File";
import React, {ReactNode, useEffect, useState} from "react";
import * as DeleteFile from "../api/files/delete";
import * as DownloadFile from "../api/files/download";
import * as FileCrypto from "../FileCrypto";

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

async function deleteFile(uuid: string, name: string): Promise<"deleted" | "cancelled"> {
  if (!confirm(`Are you sure you want to delete '${name}'?`)) {
    return "cancelled";
  }

  await DeleteFile.exec({uuid});

  return "deleted";
}

interface FileListEntryProps {
  file: APIFile,
  hkdfKeys: FileCrypto.HKDFKeys,
  onDelete: (uuid: string) => void,
}

export default function FilesListRow({file, hkdfKeys, onDelete}: FileListEntryProps): ReactNode {
  type State = "loading" | "loaded" | "no_key" | "requires_e2ee";
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [decryptedFilename, setDecryptedFilename] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      let file_key = null;
      if (file.is_e2ee) {
        if (!hkdfKeys.e2ee_key) {
          setState("requires_e2ee");
          return;
        }
        file_key = await FileCrypto.deriveKey(hkdfKeys.e2ee_key, file.salt);
        setKey(file_key);
      } else {
        file_key = await FileCrypto.deriveKey(hkdfKeys.server_trust_key, file.salt);
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
        <td colSpan={3}>Loading...</td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
    case "requires_e2ee":
      return <tr>
        <td>🔒</td>
        <td colSpan={2}>Requires a different passkey</td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
    case "no_key":
      return <tr>
        <td>⚠️</td>
        <td colSpan={2}>Unable to derive E2EE key</td>
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
        <td><span
          className={"clickable-icon"}
          onClick={
            () =>
              deleteFile(file.uuid, decryptedFilename!)
                .then((result) => {
                  if (result == "deleted") {
                    onDelete(file.uuid);
                  }
                })}
          title={"Delete this file"}>🗑️</span></td>
        <td>{time}</td>
        <td>{date}</td>
      </tr>;
  }
}
