/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

extern crate rocket;

use crate::app_db::AppDb;
use crate::app_html::{AppHtml, ViteConfig};
use crate::prf_seed::PrfSeed;
use crate::prune::prune;
use crate::routes::api;
use crate::routes::api::login::PendingLogins;
use crate::routes::api::register::PendingRegistrations;
use crate::session::SessionStore;
use rocket::State;
use rocket::fairing::AdHoc;
use rocket::fs::FileServer;
use rocket::response::content::RawHtml;
use rocket_db_pools::Database;
use serde::Deserialize;
use std::path::PathBuf;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
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

async fn prune_periodically(
    db: AppDb,
    interval: Duration,
    cancel: CancellationToken,
) -> anyhow::Result<()> {
    let mut interval = tokio::time::interval(interval);
    let uploads_root: PathBuf = PathBuf::from("uploads/");
    loop {
        tokio::select! {
            _ = interval.tick() => {
                let mut conn = db.acquire().await?;
                prune(&mut conn, uploads_root.as_path()).await?
            },
            _ = cancel.cancelled() => {
                return Ok(());
            }
        }
    }
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

    let background_tasks = CancellationToken::new();
    let background_tasks_stop_source = background_tasks.clone();
    let mut rocket = rocket::build()
        .configure(config)
        .attach(AppDb::init())
        .attach(AdHoc::on_shutdown("Cancel background tasks", move |_| {
            Box::pin(async move { background_tasks_stop_source.cancel() })
        }))
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
                api::files::delete,
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

    let rocket = rocket.ignite().await?;

    tokio::spawn(prune_periodically(
        rocket.state::<AppDb>().unwrap().clone(),
        Duration::from_secs(60 * 60),
        background_tasks.clone(),
    ));
    rocket.launch().await?;
    Ok(())
}

pub async fn serve() -> Result<(), rocket::Error> {
    rocket_main().await
}

pub fn generate_typescript(dest: &str) {
    api::generate_typescript(dest);
}
