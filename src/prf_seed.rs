/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

use rand::random;
use std::fs::OpenOptions;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

pub struct PrfSeed {
    seed: [u8; 32],
}

impl PrfSeed {
    pub fn load_or_create() -> Self {
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .create(true)
            .truncate(false);

        #[cfg(unix)]
        {
            options = options.mode(0o600);
        }

        let mut file = options.open("prf_seed.key").unwrap();
        let meta = file.metadata().unwrap();
        if meta.len() == 32 {
            let mut seed = [0u8; 32];
            file.read_exact(&mut seed).unwrap();
            return Self { seed };
        }

        let seed: [u8; 32] = random();
        file.write_all(&seed).unwrap();
        Self { seed }
    }

    pub fn get(&self) -> &[u8] {
        &self.seed
    }
}
