extern crate rocket;
use crate::app_db::AppDb;
use crate::app_html::AppHtml;
use crate::config::Config;
use crate::prf_seed::PrfSeed;
use crate::routes::api;
use crate::routes::api::login::PendingLogins;
use crate::routes::api::register::PendingRegistrations;
use crate::session::SessionStore;
use base64::prelude::*;
use rocket::State;
use rocket::fs::FileServer;
use rocket::response::content::RawHtml;
use rocket_db_pools::Database;
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

async fn rocket_main() -> Result<(), rocket::Error> {
    let site_config = Config::from_filesystem();
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
        .manage(AppHtml::init())
        .manage(PendingRegistrations::default())
        .manage(PendingLogins::default())
        .manage(PrfSeed::load_or_create())
        .manage(SessionStore::default())
        .manage(webauthn)
        .manage(site_config)
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
        )
        .mount("/assets", FileServer::from("www/dist/assets"))
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
    api::generate_typescript(dest);
}
