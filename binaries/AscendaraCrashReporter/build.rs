use std::env;

fn main() {
    // Only run this on Windows
    if env::var("CARGO_CFG_TARGET_OS").unwrap() == "windows" {
        let mut res = winres::WindowsResource::new();

        // Point to icon file relative to Cargo.toml
        res.set_icon("src/ascendara.ico");

        if let Err(e) = res.compile() {
            eprintln!("Error compiling Windows resources: {}", e);
            std::process::exit(1);
        }
    }
}
