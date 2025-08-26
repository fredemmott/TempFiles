import {ApiRegisterStartResponse} from "../gen/ApiRegisterStartResponse"

export interface Challenge {
  uuid: string;
  challenge: Uint8Array;
}

export default class {
  public static async start(): Promise<Challenge> {
    const endpoint = "/api/register/start";

    const response = await fetch(endpoint, {method: "POST"});
    const body: ApiRegisterStartResponse = await response.json();
    return {
      uuid: body.uuid,
      challenge: new Uint8Array(body.challenge),
    }
  }
};