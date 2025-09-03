/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode} from 'react';
import PendingFile from "../PendingFile";
import PendingFilesListRow from "./PendingFilesListRow";
import APIFile from "../api/files/File";

interface Props {
  files: PendingFile[],
  onUpload: (file: APIFile) => void,
}

export default function PendingFilesList({files, onUpload}: Props): ReactNode {
  if (files.length === 0) {
    return null;
  }
  return <div className={"new-files-section"}>
    <h2>⚠️ Unsaved files</h2>
    {files.map((f) => <PendingFilesListRow key={f.uuid} file={f} onUpload={onUpload}/>)}
  </div>;
}