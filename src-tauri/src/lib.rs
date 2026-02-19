use std::fs;
use std::path::Path;

// 🚀 核心升级：返回值变了！
// 现在如果成功，它会返回一个数组给前端，里面装着每一张图片的 (旧路径, 新路径, 新名字)
#[tauri::command]
fn rename_files(files_to_process: Vec<(String, String)>) -> Result<Vec<(String, String, String)>, String> {
    let mut results = Vec::new();

    for (index, (path_str, paper_type)) in files_to_process.iter().enumerate() {
        let path = Path::new(path_str);
        
        if !path.exists() {
            println!("⚠️ 找不到文件，跳过: {}", path_str);
            continue;
        }

        let parent = path.parent().unwrap_or(Path::new(""));
        let ext = path.extension().unwrap_or_default().to_str().unwrap_or("");
        
        let new_name = format!("{}-{}.{}", paper_type, index + 1, ext);
        let new_path = parent.join(&new_name);

        match fs::rename(path, &new_path) {
            Ok(_) => {
                // 改名成功后，把旧路径、新路径、新名字打包收集起来
                results.push((
                    path_str.clone(),
                    new_path.to_string_lossy().to_string(),
                    new_name
                ));
            },
            Err(e) => {
                println!("❌ 失败了: {}", e);
                return Err(e.to_string());
            }
        }
    }

    Ok(results) // 把收集好的新数据发回给前端
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![rename_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}