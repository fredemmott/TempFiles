mod config;
mod serve;

use base64::prelude::*;
use clap::{Parser, Subcommand};
use config::Config;
use rand::prelude::*;
use rocket::serde::json::serde_json;
use rusqlite::Connection;
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

static SCHEMA_SQL: &'static str = include_str!("schema.sql");
fn init() {
    let mut title = String::new();
    print!("App title, e.g. 'Fred's Temp Files': ");
    stdout().flush().unwrap();
    stdin().read_line(&mut title).unwrap();
    title = title.trim().to_string();
    let mut origin = String::new();
    print!("Origin URL, e.g. 'https://fred.example.com': ");
    stdout().flush().unwrap();
    stdin().read_line(&mut origin).unwrap();
    origin = origin.trim().to_string();
    let origin_url = Url::parse(&origin).expect("Origin was not a valid URL");
    let domain = origin_url.domain().expect("Origin must include a domain");
    let default_rp_id = domain;
    print!("Relying Party ID (default: `{}`): ", default_rp_id);
    stdout().flush().unwrap();
    let mut rp_id = String::new();
    stdin().read_line(&mut rp_id).unwrap();
    rp_id = rp_id.trim().to_string();
    if rp_id.is_empty() {
        rp_id = default_rp_id.to_string();
    }

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

    recreate_database(&false);
    generate_typescript();
}
fn add_user(username: &str, force: bool) {
    let conn = Connection::open("db.sqlite").unwrap();
    if force {
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
            .unwrap();
        if conn.changes() > 0 {
            println!("Deleted existing user {}.", username);
        }
    }

    let uuid = uuid::Uuid::new_v4().to_string();
    let prf_seed = rand::random::<[u8; 64]>();
    conn.execute(
        "INSERT INTO users (username, uuid, prf_seed) VALUES (?1, ?2, ?3)",
        (&username, &uuid, prf_seed.as_slice()),
    )
    .unwrap();
    let user_id = conn.last_insert_rowid();
    println!("Added user {} with ID {}", username, user_id);

    let token = rand::random::<[u8; 64]>();
    conn.execute(
        "INSERT INTO registration_tokens (user_id, token) VALUES (?1, ?2)",
        (user_id, token.as_slice()),
    )
    .unwrap();
    let mut register_url = Config::get().origin;
    register_url.set_path(uri!(serve::register).path().to_string().as_ref());
    register_url.query_pairs_mut().append_pair(
        "t",
        &base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&token),
    );
    println!("Registration URL: {}", register_url);
}

fn recreate_database(force: &bool) {
    if std::fs::exists("db.sqlite").unwrap() {
        if !force {
            let mut recreate_db = String::new();
            print!("DELETE and recreate database? ('yes', or anything else to skip): ");
            stdout().flush().unwrap();
            stdin().read_line(&mut recreate_db).unwrap();
            recreate_db = recreate_db.trim().to_string();
            if recreate_db != "yes" {
                return;
            }
        }
        std::fs::remove_file("db.sqlite").unwrap();
        println!("Deleted existing database.");
    }

    let conn = Connection::open("db.sqlite").unwrap();
    conn.execute_batch(SCHEMA_SQL).unwrap();
    println!("Created empty database.");
    println!("You can now run `cargo run add-user <username>` to add users.");
}

#[derive(Subcommand)]
enum Commands {
    Init,
    AddUser {
        username: String,
        #[arg(short, long)]
        force: bool,
    },
    RecreateDatabase {
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
            serde_json::to_string_pretty(&Config::get()).unwrap(),
        ),
    )
    .unwrap();

    serve::generate_typescript(dest);
}

fn main() {
    let cli = Cli::parse();
    match &cli.command {
        Commands::Init => init(),
        Commands::AddUser { username, force } => add_user(username, force.to_owned()),
        Commands::RecreateDatabase { force } => recreate_database(force),
        Commands::Serve => serve::serve(),
        Commands::GenTS => generate_typescript(),
    }
}
