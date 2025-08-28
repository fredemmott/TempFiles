pub struct PrfSeed {
    seed: [u8; 32],
}

impl PrfSeed {
    pub fn new() -> Self {
        Self {
            seed: rand::random(),
        }
    }

    pub fn get(&self) -> &[u8] {
        &self.seed
    }
}
