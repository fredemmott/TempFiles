extern crate rocket;
use crate::app_db::AppDb;
use crate::app_html::{AppHtml, ViteConfig};
use crate::prf_seed::PrfSeed;
use crate::routes::api;
use crate::routes::api::login::PendingLogins;
use crate::routes::api::register::PendingRegistrations;
use crate::session::SessionStore;
use rocket::State;
use rocket::fs::FileServer;
use rocket::response::content::RawHtml;
use rocket_db_pools::Database;
use serde::Deserialize;
use webauthn_rs::prelude::*;

#[get("/register")]
fn register(app_html: &State<AppHtml>) -> RawHtml<&str> {
    RawHtml(app_html.as_str())
}

#[get("/login")]
fn login(app_html: &State<AppHtml>) -> RawHtml<&str> {
    RawHtml(app_html.as_str())
}

#[get("/")]
fn root(app_html: &State<AppHtml>) -> RawHtml<&str> {
    RawHtml(app_html.as_str())
}

#[derive(Deserialize)]
struct RelyingParty {
    id: String,
    origin: Url,
    name: String,
}

async fn rocket_main() -> Result<(), rocket::Error> {
    let config = rocket::Config::figment();
    let vite_config: ViteConfig = config
        .extract_inner("vite")
        .expect("Invalid vite configuration");
    let relying_party: RelyingParty = config
        .extract_inner("webauthn.relying_party")
        .expect("Invalid WebAuthn configuration");
    let webauthn = WebauthnBuilder::new(&relying_party.id, &relying_party.origin)
        .expect("Invalid webauthn configuration")
        .rp_name(&relying_party.name)
        .build()
        .expect("Failed to build webauthn");
    let mut rocket = rocket::build()
        .configure(config)
        .attach(AppDb::init())
        .manage(AppHtml::init(&vite_config))
        .manage(PendingRegistrations::default())
        .manage(PendingLogins::default())
        .manage(PrfSeed::load_or_create())
        .manage(SessionStore::default())
        .manage(webauthn)
        .mount(
            "/",
            routes![
                root,
                login,
                register,
                api::files::delete_all,
                api::files::download,
                api::files::list,
                api::files::upload,
                api::register::start,
                api::register::finish,
                api::login::start,
                api::login::finish,
            ],
        );
    match vite_config {
        ViteConfig::Release { root } => {
            rocket = rocket.mount("/assets", FileServer::from(format!("{}/assets", root)));
        }
        _ => (),
    }
    rocket.ignite().await?.launch().await?;
    Ok(())
}

pub async fn serve() -> Result<(), rocket::Error> {
    rocket_main().await
}

pub fn generate_typescript(dest: &str) {
    api::generate_typescript(dest);
}
