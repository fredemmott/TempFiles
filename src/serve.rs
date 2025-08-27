use crate::config::Config;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::prelude::*;
use rocket_db_pools::{Connection, Database, sqlx};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use webauthn_rs::prelude::*;

extern crate rocket;
use rocket::http::Status;
use rocket::response::Responder;
use rocket::response::content::RawHtml;
use rocket::serde::json::Json;
use rocket::{Request, State, response};
use serde::{Deserialize, Serialize};
use sqlx::{Acquire, query};
use ts_rs::TS;
use uuid::Uuid;

#[get("/register")]
pub fn register() -> RawHtml<String> {
    RawHtml(
        include_str!("../www/app.html")
            .replace("{{SITE_CONFIG_TITLE}}", &Config::get().title)
            .replace(
                "{{GENERATED_VITE_FOOTER}}",
                r#"
<script type="module">
  import RefreshRuntime from 'http://localhost:5173/@react-refresh'
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="http://localhost:5173/@vite/client"></script>
<script type="module" src="http://localhost:5173/app.tsx"></script>
"#,
            ),
    )
}

#[derive(Debug, Clone)]
struct PendingRegistration {
    user_id: i64,
    expires: Instant,
    state: PasskeyRegistration,
}

#[derive(Debug)]
enum ApiError {
    NotFoundError(),
    DatabaseError(sqlx::Error),
    WebauthnError(WebauthnError),
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => ApiError::NotFoundError(),
            _ => ApiError::DatabaseError(e),
        }
    }
}

impl From<WebauthnError> for ApiError {
    fn from(e: WebauthnError) -> Self {
        ApiError::WebauthnError(e)
    }
}

impl<'r> Responder<'r, 'static> for ApiError {
    fn respond_to(self, r: &'r Request<'_>) -> response::Result<'static> {
        match self {
            ApiError::NotFoundError() => Status::NotFound.respond_to(r),
            ApiError::DatabaseError(e) => {
                if cfg!(debug_assertions) {
                    (
                        Status::InternalServerError,
                        format!("SQL error: {}", e.to_string()),
                    )
                        .respond_to(r)
                } else {
                    Status::InternalServerError.respond_to(r)
                }
            }
            ApiError::WebauthnError(e) => {
                if cfg!(debug_assertions) {
                    (
                        Status::InternalServerError,
                        format!("Webauthn error: {}", e.to_string()),
                    )
                        .respond_to(r)
                } else {
                    Status::InternalServerError.respond_to(r)
                }
            }
        }
    }
}

type PendingRegistrations = Arc<Mutex<HashMap<Uuid, PendingRegistration>>>;

#[derive(Deserialize, TS)]
#[ts(export)]
#[serde(crate = "rocket::serde")]
struct ApiRegisterStartRequest {
    token: String,
}

#[derive(Serialize, TS)]
#[ts(export)]
#[serde(crate = "rocket::serde")]
struct ApiRegisterStartResponse {
    challenge_uuid: Uuid,
    username: String,
    user_uuid: Uuid,
    #[ts(type = "unknown")]
    challenge: CreationChallengeResponse,
}

#[post("/api/register/start", data = "<payload>")]
async fn api_register_start(
    mut db: Connection<AppDb>,
    payload: Json<ApiRegisterStartRequest>,
    webauthn: &State<Webauthn>,
    registrations: &State<PendingRegistrations>,
) -> Result<Json<ApiRegisterStartResponse>, ApiError> {
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

    let uuid = Uuid::new_v4();
    let (challenge, server_state) =
        webauthn.start_passkey_registration(uuid, &user.username, &user.username, None)?;

    registrations.lock().unwrap().insert(
        uuid.clone(),
        PendingRegistration {
            state: server_state,
            user_id: user.user_id,
            expires: Instant::now() + Duration::from_secs(300),
        },
    );

    Ok(Json(ApiRegisterStartResponse {
        challenge_uuid: uuid,
        challenge,
        username: user.username,
        user_uuid: Uuid::parse_str(&user.uuid).unwrap(),
    }))
}

#[derive(Deserialize, TS)]
#[ts(export)]
struct ApiRegisterFinishRequest {
    #[ts(type = "unknown")]
    credential: RegisterPublicKeyCredential,
    challenge_uuid: Uuid,
    token: String,
}

#[derive(Serialize, TS)]
#[ts(export)]
struct ApiRegisterFinishResponse {}

#[post("/api/register/finish", data = "<payload>")]
async fn api_register_finish(
    mut db: Connection<AppDb>,
    payload: Json<ApiRegisterFinishRequest>,
    webauthn: &State<Webauthn>,
    registrations: &State<PendingRegistrations>,
) -> Result<Json<ApiRegisterFinishResponse>, ApiError> {
    let registration = registrations
        .lock()
        .unwrap()
        .remove(&payload.challenge_uuid);
    if registration.is_none() {
        return Err(ApiError::NotFoundError());
    }
    let registration = registration.unwrap();
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

    Ok(Json(ApiRegisterFinishResponse {}))
}

#[derive(rocket_db_pools::Database)]
#[database("app_db")]
struct AppDb(sqlx::SqlitePool);

async fn rocket_main() -> Result<(), rocket::Error> {
    let site_config = Config::get();
    let webauthn = WebauthnBuilder::new(&site_config.rp_id, &site_config.origin)
        .expect("Invalid webauthn configuration")
        .rp_name(&site_config.title)
        .build()
        .expect("Failed to build webauthn");
    let config = rocket::Config::figment()
        .merge(("port", site_config.origin.port().unwrap_or(80)))
        .merge((
            "secret_key",
            BASE64_STANDARD.encode(rand::random::<[u8; 64]>()),
        ));
    rocket::build()
        .configure(config)
        .attach(AppDb::init())
        .manage(PendingRegistrations::new(Mutex::new(HashMap::new())))
        .manage(webauthn)
        .manage(site_config)
        .mount(
            "/",
            routes![register, api_register_start, api_register_finish,],
        )
        .ignite()
        .await?
        .launch()
        .await?;
    Ok(())
}

pub async fn serve() -> Result<(), rocket::Error> {
    rocket_main().await
}

pub fn generate_typescript(dest: &str) {
    ApiRegisterStartRequest::export_all_to(dest).unwrap();
    ApiRegisterStartResponse::export_all_to(dest).unwrap();
    ApiRegisterFinishRequest::export_all_to(dest).unwrap();
    ApiRegisterFinishResponse::export_all_to(dest).unwrap();
}
