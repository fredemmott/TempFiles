/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode, useRef, useState} from "react";
import {File as APIFile} from "../api/files/File";
import * as FileUpload from "../FileUpload";
import * as FileCrypto from "../FileCrypto";

async function uploadDroppedFiles(e: React.DragEvent<HTMLDivElement>, hkdfKeys: FileCrypto.HKDFKeys): Promise<APIFile[]> {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer.files;
  if (files.length === 0) {
    return [];
  }
  return await FileUpload.multipleFiles(files, hkdfKeys);
}

interface FilePickerProps {
  hkdfKeys: FileCrypto.HKDFKeys | null,
  onUpload: (files: APIFile[]) => void,
}

export default function FilePicker({hkdfKeys, onUpload}: FilePickerProps): ReactNode {
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
