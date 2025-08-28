pub mod login;
pub mod register;

pub fn generate_typescript(dest: &str) {
    login::generate_typescript(dest);
    register::generate_typescript(dest);
}
