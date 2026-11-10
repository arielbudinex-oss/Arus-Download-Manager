fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "window_action",
            "pick_folder",
            "notify",
            "launch_at_login",
            "sync_settings",
        ]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
