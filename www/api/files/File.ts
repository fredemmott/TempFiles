import {File as WireFormat} from "../../gen/api/files/File"
import * as Base64 from "../../Base64";

export class File {
  uuid: string;
  created_at: number;
  is_e2ee: boolean;
  salt: Uint8Array<ArrayBuffer>;
  filename_iv: Uint8Array<ArrayBuffer>;
  data_iv: Uint8Array<ArrayBuffer>;
  encrypted_filename: Uint8Array<ArrayBuffer>;

  constructor(data: WireFormat) {
    this.uuid = data.uuid;
    this.created_at = data.created_at;
    this.is_e2ee = data.is_e2ee;
    this.salt = Base64.decode(data.salt);
    this.filename_iv = Base64.decode(data.filename_iv);
    this.data_iv = Base64.decode(data.data_iv);
    this.encrypted_filename = Base64.decode(data.encrypted_filename);
  }

  toJSON(): WireFormat {
    return {
      uuid: this.uuid,
      created_at: this.created_at,
      is_e2ee: this.is_e2ee,
      salt: Base64.encode(this.salt),
      filename_iv: Base64.encode(this.filename_iv),
      data_iv: Base64.encode(this.data_iv),
      encrypted_filename: Base64.encode(this.encrypted_filename),
    };
  }
}