pub mod register;

pub fn generate_typescript(dest: &str) {
    register::generate_typescript(dest);
}
