mod api_error;
mod app_db;
mod app_html;
mod config;
mod prf_seed;
mod routes;
mod serve;

use base64::prelude::*;
use clap::{Parser, Subcommand};
use config::Config;
use rocket::serde::json::serde_json;
use sqlx::query;
use std::io::{Write, stdin, stdout};
use url::Url;
#[macro_use]
extern crate rocket;

#[derive(Parser)]
#[command(version, about)]
#[command(propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

async fn unpooled_db() -> Result<sqlx::SqliteConnection, sqlx::Error> {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    sqlx::Connection::connect(&url).await
}

fn prompt(prompt: &str) -> Option<String> {
    print!("{}", prompt);
    stdout().flush().unwrap();
    let mut input = String::new();
    stdin().read_line(&mut input).unwrap();
    let result = input.trim().to_string();
    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

async fn init() {
    let title = prompt("App title, e.g. 'Fred's Temp Files': ").unwrap();
    let origin = prompt("Origin URL, e.g. 'https://fred.example.com': ").unwrap();
    let origin_url = Url::parse(&origin).expect("Origin was not a valid URL");
    let domain = origin_url.domain().expect("Origin must include a domain");
    let default_rp_id = domain;
    let rp_id = prompt(&format!(
        "Relying Party ID (default: `{}`): ",
        &default_rp_id
    ))
    .unwrap_or(default_rp_id.to_string());

    let suffix = format!(".{}", rp_id);
    if domain != rp_id && !domain.ends_with(&suffix) {
        panic!("Domain is not a subdomain of the Relying Part ID.");
    }

    let config = Config {
        title: title.to_string(),
        origin: origin_url,
        rp_id: rp_id.to_string(),
    };
    let toml = toml::to_string(&config).expect("Could not serialize configuration");
    std::fs::write("config.toml", &toml).expect("Could not write configuration file");
    println!("Wrote config.toml:\n{}", &toml);

    generate_typescript();

    let user = prompt("Enter first username (blank to skip): ");
    if let Some(user) = user {
        add_user(&user, false).await;
    }
}
async fn add_user(username: &str, force: bool) {
    let mut conn = unpooled_db().await.unwrap();
    if force {
        let deleted_rows = query!("DELETE FROM users WHERE username = ?", username)
            .execute(&mut conn)
            .await
            .unwrap()
            .rows_affected();
        if deleted_rows > 0 {
            println!("Deleted existing user {}.", username);
        }
    }

    let uuid = uuid::Uuid::new_v4().to_string();
    let user_id = query!(
        "INSERT INTO users (username, uuid) VALUES (?1, ?2)",
        username,
        uuid,
    )
    .execute(&mut conn)
    .await
    .unwrap()
    .last_insert_rowid();
    println!("Added user {} with ID {}", username, user_id);

    let token = rand::random::<[u8; 64]>();
    let token_slice = token.as_slice();
    query!(
        "INSERT INTO registration_tokens (user_id, token) VALUES (?1, ?2)",
        user_id,
        token_slice
    )
    .execute(&mut conn)
    .await
    .unwrap();
    let mut register_url = Config::from_filesystem().origin;
    register_url.set_path(uri!(serve::register).path().to_string().as_ref());
    register_url.query_pairs_mut().append_pair(
        "t",
        &base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&token),
    );
    println!("Registration URL: {}", register_url);
}

#[derive(Subcommand)]
enum Commands {
    Init,
    AddUser {
        username: String,
        #[arg(short, long)]
        force: bool,
    },
    Serve,
    GenTS,
}

fn generate_typescript() {
    let dest = "www/gen";
    std::fs::create_dir_all(&dest).unwrap();
    std::fs::write(
        format!("{}/site-config.ts", &dest),
        format!(
            "export const CONFIG = {};",
            serde_json::to_string_pretty(&Config::from_filesystem()).unwrap(),
        ),
    )
    .unwrap();

    serve::generate_typescript(dest);
    println!("Generated TypeScript files.");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv()?;
    let cli = Cli::parse();
    match &cli.command {
        Commands::Init => init().await,
        Commands::AddUser { username, force } => add_user(username, force.to_owned()).await,
        Commands::Serve => serve::serve().await?,
        Commands::GenTS => generate_typescript(),
    }
    Ok(())
}
