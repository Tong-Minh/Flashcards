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
        .invoke_handler(tauri::generate_handler![optimize_fsrs])
        .run(tauri::generate_context!())
        .expect("error while running the Flashcards app");
}
