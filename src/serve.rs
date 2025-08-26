use crate::config::Config;
use rand::RngCore;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

extern crate rocket;
use rocket::State;
use rocket::response::content::RawHtml;
use rocket::serde::json::Json;
use serde::{Deserialize, Serialize};
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
    uuid: Uuid,
    challenge: [u8; 32],
    username: String,
}

#[post("/api/register/start", data = "<payload>")]
fn api_register_start(
    payload: Json<ApiRegisterStartRequest>,
    registrations: &State<PendingRegistrations>,
) -> Json<ApiRegisterStartResponse> {
    let uuid = Uuid::new_v4();
    let challenge = rand::random::<[u8; 32]>();

    registrations.lock().unwrap().insert(
        uuid.clone(),
        PendingRegistration {
            challenge: challenge.clone(),
            expires: Instant::now() + Duration::from_secs(300),
        },
    );

    Json(ApiRegisterStartResponse {
        uuid,
        challenge,
        username: "test".to_string(),
    })
}

#[rocket::main]
async fn rocket_main() -> Result<(), rocket::Error> {
    let site_config = Config::get();
    let config = rocket::Config {
        port: site_config.origin.port().unwrap_or(80),
        secret_key: rocket::config::SecretKey::generate().expect("Failed to generate secret key"),
        ..rocket::Config::default()
    };
    rocket::build()
        .configure(config)
        .manage(PendingRegistrations::new(Mutex::new(HashMap::new())))
        .manage(site_config)
        .mount("/", routes![register, api_register_start])
        .ignite()
        .await?
        .launch()
        .await?;
    Ok(())
}

pub fn serve() {
    rocket_main().unwrap();
}

pub fn generate_typescript(dest: &str) {
    ApiRegisterStartResponse::export_all_to(dest).unwrap();
}
