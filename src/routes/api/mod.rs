/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

pub mod files;
pub mod login;
pub mod register;

pub fn generate_typescript(dest: &str) {
    files::generate_typescript(dest);
    login::generate_typescript(dest);
    register::generate_typescript(dest);
}
