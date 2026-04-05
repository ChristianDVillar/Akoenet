#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
#[tauri::command]
fn get_running_processes() -> Vec<String> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let mut names: Vec<String> = sys
        .processes()
        .values()
        .map(|p| p.name().to_string_lossy().into_owned())
        .collect();
    names.sort_unstable();
    names.dedup();
    names
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
#[tauri::command]
fn get_running_processes() -> Vec<String> {
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_running_processes])
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
