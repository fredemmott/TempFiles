/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import {File as APIFile} from "./api/files/File";
import * as FileCrypto from "./FileCrypto";
import * as UploadFile from "./api/files/upload";

export async function singleFile(file: File, hkdf_keys: FileCrypto.HKDFKeys): Promise<APIFile> {
  let is_e2ee = true;
  let hkdf_key = hkdf_keys.e2ee_key;
  if (hkdf_key === null) {
    is_e2ee = false;
    hkdf_key = hkdf_keys.server_trust_key;
  }

  const crypto_params = await FileCrypto.generateParametersForNewFile(hkdf_key);
  const encrypted_filename = await FileCrypto.encryptFileName(
    crypto_params,
    new TextEncoder().encode(file.name) as Uint8Array<ArrayBuffer>,
  );
  const unencrypted_data = new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  }));

  const encrypted_data = await FileCrypto.encryptFileContents(
    crypto_params,
    unencrypted_data,
  );

  const request: UploadFile.Request = {
    is_e2ee,
    salt: crypto_params.salt,
    filename_iv: crypto_params.filename_iv,
    data_iv: crypto_params.data_iv,
    encrypted_filename,
    encrypted_data,
  };

  const response: UploadFile.Response = await UploadFile.exec(request);
  return response.file;
}

export async function multipleFiles(files: FileList, hkdf_keys: FileCrypto.HKDFKeys) {
  try {
    return await Promise.all(Array.from(files).map((file) => singleFile(file, hkdf_keys)));
  } catch (e) {
    if (e instanceof Response) {
      alert(`An error occurred uploading a file to the server: ${e.status} ${e.statusText}`);
      window.location.reload();
    }
    throw e;
  }
}
