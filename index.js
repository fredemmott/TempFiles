const challenge = crypto.getRandomValues(new Uint8Array(32));
const user_id = new TextEncoder().encode('12345');
const e2e_seed = new TextEncoder().encode('e2e_seed');

async function webauthn_register(challenge, user_id) {
    const payload = {
        publicKey: {
            authenticatorSelection: {
                authenticatorAttachment: "cross-platform",
                userVerification: "discouraged",
                residentKey: "required",
            },
            challenge: challenge.buffer,
            rp: {
                name: "Fred's TempFiles Tool",
                id: "localhost",
            },
            pubKeyCredParams: [
                {
                    type: "public-key",
                    alg: -7,
                }
            ],
            timeout: 30000,
            user: {
                name: "fred",
                displayName: "fred",
                id: user_id,
            },
            hints: ["hybrid"],
            extensions: {
                prf: {
                    eval: {first: e2e_seed},
                }
            }
        }
    }
    return await navigator.credentials.create(payload);
}

async function webauthn_get(challenge) {
    const payload = {
        mediation: "required",
        publicKey: {
            challenge: challenge.buffer,
            timeout: 30000,
            hints: ["hybrid"],
            extensions: {
                prf: {
                    eval: {first: e2e_seed},
                }
            },
        },
    };
    return await navigator.credentials.get(payload);
}

