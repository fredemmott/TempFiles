/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import React, {Fragment, ReactNode, useId, useState} from 'react';
import PendingFile from "../PendingFile";
import APIFile from "../api/files/File";
import * as UploadFile from "../api/files/upload";

interface Props {
  file: PendingFile,
  onUpload: (_: APIFile) => void,
}

interface UploadState {
  clicked: boolean,
  progress: "not-started" | "in-progress" | "completed",
}

export default function PendingFilesListRow({file, onUpload}: Props): ReactNode {
  type Expiration = "1 hour" | "24 hours" | "1 week" | "never";
  const [expiration, setExpiration] = useState<Expiration>("24 hours");
  const [singleDownload, setSingleDownload] = useState<boolean>(false);
  const [uploadState, setUploadState] = useState<UploadState>({clicked: false, progress: "not-started"});
  const singleDownloadId = useId();
  const lifetimeId = useId();

  if (file.encryptedFile !== null && uploadState.clicked && uploadState.progress === "not-started") {
    setUploadState((prev) => ({...prev, progress: "in-progress"}));
    UploadFile.exec({
      ...file.encryptedFile!,
      uuid: file.uuid,
      expires_at: null,
      max_downloads: singleDownload ? 1 : null,
    }).then(({file}) => {
      setUploadState((prev) => ({...prev, progress: "completed"}));
      onUpload(file);
    });
  }

  const committed = uploadState.clicked;

  return <div className={"pending-file"}>
    <h3 className={"pending-file-header"}>
      <span className={"file-name"}>{file.fileName}</span>
    </h3>
    <form className={"pending-file-options"}>
      <input
        id={singleDownloadId}
        type={"checkbox"}
        name={"singleDownload"}
        checked={singleDownload}
        onChange={() => setSingleDownload(!singleDownload)}
      />
      <label htmlFor={singleDownloadId}>Delete after single download</label>
      <legend>Expiration:</legend>
      <fieldset id={lifetimeId} disabled={committed}>
        {
          ["1 hour", "24 hours", "1 week", "unlimited"].map((lifetime) => {
            const id = `${lifetimeId}-${lifetime}`;
            return (<Fragment key={id}>
              <input
                id={id}
                type={"radio"}
                name={"keepFor"}
                value={lifetime}
                checked={expiration === lifetime}
                onChange={() => setExpiration(lifetime as Expiration)}
              />
              <label htmlFor={id}>{lifetime}</label>
            </Fragment>);
          })
        }
      </fieldset>
      <input type={"submit"} value={"💾 Save"} disabled={committed} onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setUploadState((prev) => ({...prev, clicked: true}));
      }}/>
    </form>
  </div>;
}