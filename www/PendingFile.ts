import {EncryptedFile} from "./FileCrypto";

export default interface PendingFile {
  uuid: string,
  fileName: string,
  encryptedFile: null | EncryptedFile,
}