/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {ReactNode, useRef, useState} from "react";

interface FilePickerProps {
  onFilesPicked: (files: File[]) => void,
}

export default function FilePicker({onFilesPicked}: FilePickerProps): ReactNode {
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

        onFilesPicked(Array.from(files));
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
      preventDefault(e);
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      onFilesPicked(files);
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
