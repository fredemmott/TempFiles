use crate::config::Config;

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
        include_str!("../www/app.html")
            .replace("{{SITE_CONFIG_TITLE}}", &Config::get().title)
            .replace(
                "{{GENERATED_VITE_FOOTER}}",
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
"#,
            )
    }
}
