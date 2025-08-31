/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum ViteConfig {
    Dev { origin: String },
    Release { root: String },
}

pub struct AppHtml {
    content: String,
}

impl AppHtml {
    pub fn as_str(&self) -> &str {
        &self.content
    }

    pub fn init(vite_config: &ViteConfig) -> Self {
        Self {
            content: Self::get_content(vite_config),
        }
    }

    fn get_content(vite_config: &ViteConfig) -> String {
        let footer = Self::get_vite_footer(vite_config);
        include_str!("../www/app.html").replace("{{GENERATED_VITE_FOOTER}}", footer.as_ref())
    }

    fn get_vite_footer(vite_config: &ViteConfig) -> String {
        match vite_config {
            ViteConfig::Dev { origin } => Self::get_vite_dev_footer(&origin),
            ViteConfig::Release { root } => Self::get_vite_release_footer(&root),
        }
    }

    fn get_vite_dev_footer(origin: &str) -> String {
        format!(
            r#"
<script type="module">
  import RefreshRuntime from '{0}/@react-refresh'
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {{}}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="{0}/@vite/client"></script>
<script type="module" src="{0}/app.tsx"></script>
"#,
            origin
        )
    }

    fn get_vite_release_footer(root: &str) -> String {
        let map: ViteManifest = serde_json::from_str(
            std::fs::read_to_string(format!("{}/.vite/manifest.json", root))
                .unwrap()
                .as_str(),
        )
        .unwrap();
        let app = map.get("app.tsx").unwrap();
        let css_link_tags = match &app.css {
            Some(x) => x
                .iter()
                .map(|x| format!("<link rel='stylesheet' href='/{}'>", x))
                .collect::<Vec<String>>(),
            None => vec![],
        };

        return format!(
            r#"
            {}
            <script type="module" src="/{}"></script>
            "#,
            css_link_tags.join("\n"),
            app.file,
        );
    }
}

// Dead code is fine here as we don't use these in development builds.
#[derive(Deserialize)]
struct ViteChunk {
    #[allow(dead_code)]
    file: String,
    #[allow(dead_code)]
    css: Option<Vec<String>>,
}

#[allow(dead_code)]
type ViteManifest = HashMap<String, ViteChunk>;
