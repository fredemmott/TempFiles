use crate::config::Config;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::prelude::*;
use rocket_db_pools::{Connection, Database, sqlx};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

extern crate rocket;
use rocket::http::Status;
use rocket::response::Responder;
use rocket::response::content::RawHtml;
use rocket::serde::json::Json;
use rocket::{Request, State, response};
use serde::{Deserialize, Serialize};
use sqlx::query;
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
    challenge: [u8; 32],
    expires: Instant,
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
    challenge: [u8; 32],
    username: String,
    user_uuid: Uuid,
}

#[derive(Debug)]
enum ApiError {
    DatabaseError(sqlx::Error),
}
impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        ApiError::DatabaseError(e)
    }
}

impl<'r> Responder<'r, 'static> for ApiError {
    fn respond_to(self, r: &'r Request<'_>) -> response::Result<'static> {
        match self {
            ApiError::DatabaseError(e) => match e {
                sqlx::Error::RowNotFound => Status::BadRequest.respond_to(r),
                _ => {
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
            },
        }
    }
}

#[post("/api/register/start", data = "<payload>")]
async fn api_register_start(
    mut db: Connection<AppDb>,
    payload: Json<ApiRegisterStartRequest>,
    registrations: &State<PendingRegistrations>,
) -> Result<Json<ApiRegisterStartResponse>, ApiError> {
    let token_base64 = &payload.token;
    let token = URL_SAFE_NO_PAD.decode(token_base64).unwrap();
    let user = query!(
        r#"
    SELECT username, uuid
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
    let challenge = rand::random::<[u8; 32]>();

    registrations.lock().unwrap().insert(
        uuid.clone(),
        PendingRegistration {
            challenge: challenge.clone(),
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

#[derive(rocket_db_pools::Database)]
#[database("app_db")]
struct AppDb(sqlx::SqlitePool);

async fn rocket_main() -> Result<(), rocket::Error> {
    let site_config = Config::get();
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
        .manage(site_config)
        .mount("/", routes![register, api_register_start])
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
}
