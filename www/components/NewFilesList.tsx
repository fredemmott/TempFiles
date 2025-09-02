/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode} from 'react';
import PendingFile from "../PendingFile";
import NewFilesListRow from "./NewFilesListRow";
import APIFile from "../api/files/File";

interface Props {
  files: PendingFile[],
  onUpload: (file: APIFile) => void,
}

export default function NewFilesList({files, onUpload}: Props): ReactNode {
  if (files.length === 0) {
    return null;
  }
  return <ul className={"new-files-list"}>
    {files.map((f) => <NewFilesListRow key={f.uuid} file={f} onUpload={onUpload}/>)}
  </ul>;
}