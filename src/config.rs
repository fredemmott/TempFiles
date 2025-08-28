use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Serialize, Deserialize)]
pub struct Config {
    pub title: String,
    pub origin: Url,
    pub rp_id: String,
}
impl Config {
    pub fn from_filesystem() -> Self {
        let text = std::fs::read_to_string("config.toml").unwrap();
        toml::from_str(&text).unwrap()
    }
}
