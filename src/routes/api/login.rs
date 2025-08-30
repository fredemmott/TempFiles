use crate::api_error::ApiError;
use crate::app_db::AppDb;
use crate::prf_seed::PrfSeed;
use crate::session::{SessionSecret, SessionStore};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::prelude::*;
use rocket::State;
use rocket::serde::json::Json;
use rocket_db_pools::Connection;
use rocket_db_pools::sqlx::query;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use ts_rs::TS;
use uuid::Uuid;
use webauthn_rs::prelude::*;

#[derive(Debug, Clone)]
pub struct PendingLogin {
    expires: Instant,
    state: DiscoverableAuthentication,
}

#[derive(Debug, Default)]
pub struct PendingLogins {
    data: Arc<Mutex<HashMap<Uuid, PendingLogin>>>,
}

impl PendingLogins {
    pub fn add(&self, state: DiscoverableAuthentication) -> Uuid {
        let uuid = Uuid::new_v4();
        self.data.lock().unwrap().insert(
            uuid,
            PendingLogin {
                expires: Instant::now() + std::time::Duration::from_secs(300),
                state,
            },
        );
        uuid
    }
    pub fn remove(&self, uuid: Uuid) -> Option<PendingLogin> {
        match self.data.lock().unwrap().remove(&uuid) {
            Some(v) if v.expires > Instant::now() => Some(v),
            _ => None,
        }
    }
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/login/StartResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct StartResponse {
    challenge_uuid: Uuid,
    #[ts(type = "unknown")]
    challenge: RequestChallengeResponse,
    prf_seed: String,
}

#[post("/api/login/start")]
pub async fn start(
    webauthn: &State<Webauthn>,
    logins: &State<PendingLogins>,
    prf_seed: &State<PrfSeed>,
) -> Result<Json<StartResponse>, ApiError> {
    let (challenge, state) = webauthn.start_discoverable_authentication()?;
    let uuid = logins.add(state);
    Ok(Json(StartResponse {
        challenge_uuid: uuid,
        challenge,
        prf_seed: URL_SAFE_NO_PAD.encode(prf_seed.get()),
    }))
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/login/FinishRequest.ts")]
#[serde(crate = "rocket::serde")]
pub struct FinishRequest {
    challenge_uuid: Uuid,
    #[ts(type = "unknown")]
    credential: PublicKeyCredential,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/login/FinishResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct FinishResponse {
    username: String,
    session: SessionSecret,
}

#[post("/api/login/finish", data = "<payload>")]
pub async fn finish(
    mut db: Connection<AppDb>,
    payload: Json<FinishRequest>,
    logins: &State<PendingLogins>,
    webauthn: &State<Webauthn>,
    sessions: &State<SessionStore>,
) -> Result<Json<FinishResponse>, ApiError> {
    let login = logins
        .remove(payload.challenge_uuid)
        .ok_or(ApiError::NotFoundError())?;

    let (user_uuid, credential_id) =
        webauthn.identify_discoverable_authentication(&payload.credential)?;
    let user_uuid_string = user_uuid.to_string();

    let data = query!(
        r#"
        SELECT users.id as user_id, users.username, passkeys.public_key, passkeys.id as passkey_id
        FROM users JOIN passkeys ON users.id = passkeys.user_id
        WHERE users.uuid = ?1 AND passkeys.credential_id = ?2
    "#,
        user_uuid_string,
        credential_id
    )
    .fetch_one(&mut **db)
    .await?;

    let passkey: Passkey = serde_json::from_str(&data.public_key).unwrap();
    let discoverable = vec![DiscoverableKey::from(passkey)];

    let result = webauthn.finish_discoverable_authentication(
        &payload.credential,
        login.state,
        &discoverable,
    )?;

    // TODO: check needs_update()

    if !result.user_verified() {
        return Err(ApiError::NotFoundError());
    }

    Ok(Json(FinishResponse {
        username: data.username,
        session: sessions
            .create(data.user_id, data.passkey_id)
            .secret()
            .clone(),
    }))
}

pub fn generate_typescript(dest: &str) {
    StartResponse::export_all_to(dest).unwrap();
    FinishRequest::export_all_to(dest).unwrap();
    FinishResponse::export_all_to(dest).unwrap();
}
