use crate::config::Config;
extern crate rocket;
use rocket::State;

struct RegistrationChallenge {
    token: String,
    challenge: [u8; 32],
}

struct
#[get("/register?<token>")]
fn register(token: &str) -> &'static str {
    return "Hello";
}

#[rocket::main]
async fn rocket_main() -> Result<(), rocket::Error> {
    let config = rocket::Config {
        port: Config::get().origin.port().unwrap_or(80),
        secret_key: rocket::config::SecretKey::generate().expect("Failed to generate secret key"),
        ..rocket::Config::default()
    };
    rocket::build()
        .configure(config)
        .mount("/", routes![register])
        .ignite()
        .await?
        .launch()
        .await?;
    Ok(())
}

pub fn serve() {
    rocket_main().unwrap();
}
