// The desktop shell: a window showing the static web build (../out), plus the plugins it uses.
// All app logic is in the web code; see lib/store/desktop.ts and lib/store/files.ts.

use fsrs::{compute_parameters, ComputeParametersInput, FSRSItem, FSRSReview};

/// Fits FSRS parameters to the review log (lib/optimizer.ts builds the items). Runs natively because
/// the WebAssembly optimizer needs a cross-origin isolated page, which the Mac app's WebKit window
/// doesn't provide. Items arrive flattened: `lengths[i]` reviews per item, in order.
#[tauri::command]
async fn optimize_fsrs(ratings: Vec<u32>, deltas: Vec<u32>, lengths: Vec<u32>, card_ids: Vec<i64>) -> Result<Vec<f32>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if ratings.len() != deltas.len() || lengths.len() != card_ids.len() {
            return Err("Mismatched review data".to_string());
        }
        let mut train_set = Vec::with_capacity(lengths.len());
        let mut at = 0usize;
        for len in lengths {
            let end = at + len as usize;
            if end > ratings.len() {
                return Err("Mismatched review data".to_string());
            }
            let reviews = (at..end)
                .map(|i| FSRSReview { rating: ratings[i], delta_t: deltas[i] })
                .collect();
            train_set.push(FSRSItem { reviews });
            at = end;
        }
        compute_parameters(ComputeParametersInput {
            train_set,
            card_ids: Some(card_ids),
            ..ComputeParametersInput::default()
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Total size of a file, or of everything in a folder (unreadable entries count as 0)
fn size_of(path: &std::path::Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    std::fs::read_dir(path)
        .map(|entries| entries.flatten().map(|e| size_of(&e.path())).sum())
        .unwrap_or(0)
}

/// Where the app itself is installed: its folder on Windows, the .app bundle on a Mac
fn install_location() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    if cfg!(target_os = "macos") {
        exe.ancestors().find(|p| p.extension().map_or(false, |e| e == "app")).map(|p| p.to_path_buf())
    } else {
        exe.parent().map(|p| p.to_path_buf())
    }
}

/// The app's own data (settings, web view storage and caches), not the library folder
fn data_locations(app: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    use tauri::Manager;
    let paths = app.path();
    let mut dirs: Vec<std::path::PathBuf> = [paths.app_data_dir(), paths.app_local_data_dir(), paths.app_cache_dir(), paths.app_config_dir()]
        .into_iter()
        .flatten()
        .collect();
    // The Mac web view keeps its storage under ~/Library/WebKit/<identifier>
    if cfg!(target_os = "macos") {
        if let Ok(home) = paths.home_dir() {
            dirs.push(home.join("Library").join("WebKit").join(&app.config().identifier));
        }
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

#[derive(serde::Serialize)]
struct AppStorage {
    install: u64,
    data: u64,
}

/// How much space the app takes, besides the library (for the Storage page)
#[tauri::command]
async fn app_storage(app: tauri::AppHandle) -> AppStorage {
    tauri::async_runtime::spawn_blocking(move || AppStorage {
        install: install_location().map(|p| size_of(&p)).unwrap_or(0),
        data: data_locations(&app).iter().map(|p| size_of(p)).sum(),
    })
    .await
    .unwrap_or(AppStorage { install: 0, data: 0 })
}

/// Uninstalls the app (the library folder is handled by the page first, if the user chose to delete
/// it). Windows: starts the installer's uninstaller, which also offers to remove the app's data, and
/// quits so it can. Mac: removes the app's data, moves the app to the Trash, and quits.
#[tauri::command]
fn uninstall_app(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let dir = install_location().ok_or("Couldn't find where Flashcards is installed.")?;
        let uninstaller = dir.join("uninstall.exe");
        if !uninstaller.exists() {
            return Err("The uninstaller wasn't found. Uninstall Flashcards from Settings → Apps instead.".into());
        }
        std::process::Command::new(uninstaller).spawn().map_err(|e| e.to_string())?;
        app.exit(0);
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        let bundle = install_location().ok_or("Couldn't find the Flashcards app.")?;
        for dir in data_locations(&app) {
            let _ = std::fs::remove_dir_all(dir);
        }
        let mut trash = trash::TrashContext::default();
        trash.set_delete_method(DeleteMethod::NsFileManager);
        trash.delete(&bundle).map_err(|e| format!("Couldn't move Flashcards to the Trash: {e}"))?;
        app.exit(0);
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let _ = app;
        Err("Uninstalling from inside the app isn't supported on this system.".into())
    }
}

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
        // Source links open in the system browser
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![optimize_fsrs, app_storage, uninstall_app])
        .run(tauri::generate_context!())
        .expect("error while running the Flashcards app");
}
