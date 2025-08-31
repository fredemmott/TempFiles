/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {File as APIFile} from "../gen/api/files/File";
import React, {ReactNode} from "react";
import FilesListRow from "./FilesListRow";
import * as Base64 from "../Base64";
import * as FileCrypto from "../FileCrypto";

interface FilesListProps {
  files: APIFile[],
  hkdfKeys: FileCrypto.HKDFKeys | null,
}

export default function FilesList({files, hkdfKeys}: FilesListProps): ReactNode {
  if (files.length === 0 || hkdfKeys === null) {
    return <div className={"files-list"}>No usable files are available for download.</div>
  }
  files = files.toSorted((a, b) => Number(b.created_at - a.created_at));

  return <div className={"files-list"}>
    <h2>Available Files</h2>
    <table className={"files-list-table"}>
      <tbody>
      {files.map((file) =>
        <FilesListRow key={Base64.encode(file.salt)} file={file} hkdfKeys={hkdfKeys}/>
      )}
      </tbody>
    </table>
  </div>;
}
