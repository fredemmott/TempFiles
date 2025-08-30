use crate::config::Config;
use serde::Deserialize;
use std::collections::HashMap;

pub struct AppHtml {
    content: String,
}

impl AppHtml {
    pub fn as_str(&self) -> &str {
        &self.content
    }

    pub fn init() -> Self {
        Self {
            content: Self::get_content(),
        }
    }

    fn get_content() -> String {
        let footer = Self::get_vite_footer();
        include_str!("../www/app.html")
            .replace("{{SITE_CONFIG_TITLE}}", &Config::from_filesystem().title)
            .replace("{{GENERATED_VITE_FOOTER}}", footer.as_ref())
    }

    #[cfg(debug_assertions)]
    fn get_vite_footer() -> &'static str {
        r#"
<script type="module">
  import RefreshRuntime from 'http://localhost:5173/@react-refresh'
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>
<script type="module" src="http://localhost:5173/@vite/client"></script>
<script type="module" src="http://localhost:5173/app.tsx"></script>
"#
    }

    #[cfg(not(debug_assertions))]
    fn get_vite_footer() -> String {
        let map: ViteManifest = serde_json::from_str(
            std::fs::read_to_string("www/dist/.vite/manifest.json")
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
