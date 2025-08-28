use crate::api_error::ApiError;
use crate::app_db::AppDb;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::prelude::*;
use rocket::State;
use rocket::serde::json::Json;
use rocket_db_pools::Connection;
use rocket_db_pools::sqlx::prelude::*;
use rocket_db_pools::sqlx::query;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use ts_rs::TS;
use webauthn_rs::prelude::*;

#[derive(Debug, Clone)]
pub struct PendingRegistration {
    user_id: i64,
    expires: Instant,
    state: PasskeyRegistration,
}

#[derive(Debug, Default)]
pub struct PendingRegistrations {
    data: Arc<Mutex<HashMap<Uuid, PendingRegistration>>>,
}

impl PendingRegistrations {
    pub fn add(&self, uuid: Uuid, registration: PendingRegistration) {
        self.data.lock().unwrap().insert(uuid, registration);
    }
    pub fn remove(&self, uuid: &Uuid) -> Option<PendingRegistration> {
        self.data.lock().unwrap().remove(uuid)
    }
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/register/StartRequest.ts")]
#[serde(crate = "rocket::serde")]
pub struct StartRequest {
    token: String,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/register/StartResponse.ts")]
#[serde(crate = "rocket::serde")]
pub struct StartResponse {
    challenge_uuid: Uuid,
    username: String,
    user_uuid: Uuid,
    #[ts(type = "unknown")]
    challenge: CreationChallengeResponse,
}

#[post("/api/register/start", data = "<payload>")]
pub async fn start(
    mut db: Connection<AppDb>,
    payload: Json<StartRequest>,
    webauthn: &State<Webauthn>,
    registrations: &State<PendingRegistrations>,
) -> Result<Json<StartResponse>, ApiError> {
    let token_base64 = &payload.token;
    let token = URL_SAFE_NO_PAD.decode(token_base64).unwrap();
    let user = query!(
        r#"
    SELECT username, uuid, users.id as user_id
    FROM users JOIN registration_tokens
    ON users.id = registration_tokens.user_id
    WHERE registration_tokens.token = ?1
    AND registration_tokens.expires_at > CURRENT_TIMESTAMP
    "#,
        token
    )
    .fetch_one(&mut **db)
    .await?;

    let uuid = user.uuid.parse::<Uuid>().unwrap();
    let (challenge, server_state) =
        webauthn.start_passkey_registration(uuid, &user.username, &user.username, None)?;

    registrations.add(
        uuid.clone(),
        PendingRegistration {
            state: server_state,
            user_id: user.user_id,
            expires: Instant::now() + Duration::from_secs(300),
        },
    );

    Ok(Json(StartResponse {
        challenge_uuid: uuid,
        challenge,
        username: user.username,
        user_uuid: Uuid::parse_str(&user.uuid).unwrap(),
    }))
}

#[derive(Deserialize, TS)]
#[ts(export_to = "api/register/FinishRequest.ts")]
pub struct FinishRequest {
    #[ts(type = "unknown")]
    credential: RegisterPublicKeyCredential,
    challenge_uuid: Uuid,
    token: String,
}

#[derive(Serialize, TS)]
#[ts(export_to = "api/register/FinishResponse.ts")]
pub struct FinishResponse {}

#[post("/api/register/finish", data = "<payload>")]
pub async fn finish(
    mut db: Connection<AppDb>,
    payload: Json<FinishRequest>,
    webauthn: &State<Webauthn>,
    registrations: &State<PendingRegistrations>,
) -> Result<Json<FinishResponse>, ApiError> {
    let registration = registrations
        .remove(&payload.challenge_uuid)
        .ok_or(ApiError::NotFoundError())?;
    if registration.expires < Instant::now() {
        return Err(ApiError::NotFoundError());
    }

    let passkey = webauthn.finish_passkey_registration(&payload.credential, &registration.state)?;

    let token_base64 = &payload.token;
    let token = URL_SAFE_NO_PAD.decode(token_base64).unwrap();

    let conn = db.acquire().await?;
    let mut tx = conn.begin().await?;

    let user = query!(
        r#"
    SELECT username, users.id as user_id
    FROM users JOIN registration_tokens
    ON users.id = registration_tokens.user_id
    WHERE registration_tokens.token = ?1
    AND registration_tokens.expires_at > CURRENT_TIMESTAMP;
    "#,
        token
    )
    .fetch_one(&mut *tx)
    .await?;
    query!("DELETE FROM registration_tokens WHERE token = ?1", token)
        .execute(&mut *tx)
        .await?;

    if user.user_id != registration.user_id {
        return Err(ApiError::NotFoundError());
    }

    let passkey_id = passkey.cred_id().to_vec();
    let passkey_json = serde_json::to_string(&passkey).unwrap().to_string();

    query!(
        "INSERT INTO passkeys (user_id, credential_id, public_key) VALUES (?1, ?2, ?3)",
        user.user_id,
        passkey_id,
        passkey_json
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(FinishResponse {}))
}

pub fn generate_typescript(dest: &str) {
    StartRequest::export_all_to(dest).unwrap();
    StartResponse::export_all_to(dest).unwrap();
    FinishRequest::export_all_to(dest).unwrap();
    FinishResponse::export_all_to(dest).unwrap();
}
