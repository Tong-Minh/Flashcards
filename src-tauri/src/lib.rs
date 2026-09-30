// The desktop shell: a window showing the static web build (../out), plus the plugins it uses.
// All app logic is in the web code; see lib/store/desktop.ts and lib/store/files.ts.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Read and write the library folder
        .plugin(tauri_plugin_fs::init())
        // Remember access to the folder the user picked, across launches (must come after fs)
        .plugin(tauri_plugin_persisted_scope::init())
        // The "Choose folder" picker
        .plugin(tauri_plugin_dialog::init())
        // Updates from GitHub Releases, and restarting after one installs
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running the Flashcards app");
}
