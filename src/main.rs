/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

mod api_error;
mod app_db;
mod app_html;
mod prf_seed;
mod prune;
mod routes;
mod serve;
mod session;

use crate::prune::prune;
use clap::{Parser, Subcommand};
use sqlx::query;
use std::io::{Write, stdin, stdout};
use std::path::PathBuf;

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

    let token = bs58::encode(rand::random::<[u8; 64]>()).into_string();
    query!(
        "INSERT INTO registration_tokens (user_id, token) VALUES (?1, ?2)",
        user_id,
        token,
    )
    .execute(&mut conn)
    .await
    .unwrap();
    // Using base58 for being concise and having no special characters.
    // This makes double-click-to-copy easier
    println!("Registration code: {}", token);
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
    Prune,
}

fn generate_typescript() {
    let dest = "www/gen";
    serve::generate_typescript(dest);
    println!("Generated TypeScript files.");
}

async fn prune_main() -> anyhow::Result<()> {
    let mut db = unpooled_db().await?;
    let root: PathBuf = "uploads/".into();
    prune(&mut db, &root).await?;
    Ok(())
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
        Commands::Prune => prune_main().await?,
    }
    Ok(())
}
