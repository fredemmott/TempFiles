/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import APIFile from "../api/files/File";
import React, {ReactNode} from "react";
import FilesListRow from "./FilesListRow";
import * as FileCrypto from "../FileCrypto";

interface FilesListProps {
  files: APIFile[],
  hkdfKeys: FileCrypto.HKDFKeys | null,
  onDelete: (uuid: string) => void,
}

export default function FilesList({files, hkdfKeys, onDelete}: FilesListProps): ReactNode {
  if (files.length === 0 || hkdfKeys === null) {
    return <div className={"files-list"}>No usable files are available for download.</div>
  }
  files = files.toSorted((a, b) => Number(b.created_at - a.created_at));

  return <div className={"files-list"}>
    <h2>Available Files</h2>
    <table className={"files-list-table"}>
      <tbody>
      {files.map((file) =>
        <FilesListRow
          key={file.uuid}
          file={file}
          hkdfKeys={hkdfKeys}
          onDelete={onDelete}
        />
      )}
      </tbody>
    </table>
  </div>;
}
