use std::path::Path;
use base64::{engine::general_purpose, Engine as _};

// ==========================================
// 🌟 辅助引擎：跨平台 Magick 唤醒器
// ==========================================
fn magick_command() -> std::process::Command {
    #[cfg(target_os = "macos")]
    {
        if Path::new("/opt/homebrew/bin/magick").exists() {
            return std::process::Command::new("/opt/homebrew/bin/magick");
        } else if Path::new("/usr/local/bin/magick").exists() {
            return std::process::Command::new("/usr/local/bin/magick");
        }
    }
    std::process::Command::new("magick")
}

// ==========================================
// 🌟 核心引擎 A：万能探针
// ==========================================
#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    let output = magick_command()
        .args(["identify", "-format", "%w %h %x %U\n", &path_str])
        .output().map_err(|e| format!("启动探测引擎失败: {}", e))?;

    if !output.status.success() { return Err("解析尺寸失败".to_string()); }
    
    let dim_str = String::from_utf8_lossy(&output.stdout);
    let first_line = dim_str.lines().next().unwrap_or("");
    let dims: Vec<&str> = first_line.trim().split_whitespace().collect();
    
    if dims.len() >= 2 {
        let w_px: f32 = dims[0].parse().unwrap_or(0.0);
        let h_px: f32 = dims[1].parse().unwrap_or(0.0);
        let mut dpi: f32 = 300.0; 
        if dims.len() >= 3 {
            let parsed_dpi: f32 = dims[2].parse().unwrap_or(0.0);
            if parsed_dpi > 0.0 {
                dpi = parsed_dpi; 
                if dims.len() >= 4 && dims[3].to_lowercase().contains("centimeter") { dpi *= 2.54; }
            }
        }
        Ok(format!("{:.1} x {:.1} cm", (w_px / dpi) * 2.54, (h_px / dpi) * 2.54))
    } else { Err("解析尺寸失败".to_string()) }
}

// ==========================================
// 🌟 核心引擎 B：终极预览图生成
// ==========================================
#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    let ext = Path::new(&path_str).extension().unwrap_or_default().to_string_lossy().to_lowercase();
    
    if ext == "jpg" || ext == "jpeg" || ext == "png" {
        #[cfg(target_os = "windows")]
        let final_path = path_str.replace("\\", "/");
        #[cfg(not(target_os = "windows"))]
        let final_path = path_str;
        
        return Ok(format!("asset://localhost/{}", final_path));
    }

    let target_layer = format!("{}[0]", path_str);
    let output = magick_command()
        .args([&target_layer, "-background", "white", "-flatten", "-resize", "400x400>", "-strip", "jpeg:-"])
        .output().map_err(|e| format!("引擎启动失败: {}", e))?;

    if output.status.success() {
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&output.stdout)))
    } else { Err("生成预览图失败".to_string()) }
}

// ==========================================
// 🌟 核心引擎 C：图像排版与导出 (PSD 强制合并图层防破图)
// ==========================================
#[tauri::command]
async fn process_image(
    path_str: String, mode: String, target_w_cm: f32, target_h_cm: f32,
    crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32,
) -> Result<(String, String), String> { 
    let input_path = Path::new(&path_str);
    if !input_path.exists() { return Err("文件不存在".to_string()); }

    let target_layer = format!("{}[0]", path_str);
    let output_dim = magick_command().args(["identify", "-format", "%w %h", &target_layer]).output().map_err(|e| format!("启动探测引擎失败: {}", e))?;
    if !output_dim.status.success() { return Err("无法解析尺寸".to_string()); }

    let dim_str = String::from_utf8_lossy(&output_dim.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    if dims.len() < 2 { return Err("获取尺寸异常".to_string()); }
    
    let orig_w: f64 = dims[0].parse().unwrap_or(1.0);
    let orig_h: f64 = dims[1].parse().unwrap_or(1.0);

    let px = (crop_x as f64 / 100.0 * orig_w).round() as u32;
    let py = (crop_y as f64 / 100.0 * orig_h).round() as u32;
    let pw = ((crop_w as f64 / 100.0 * orig_w).round() as u32).max(1);
    let ph = ((crop_h as f64 / 100.0 * orig_h).round() as u32).max(1);

    let target_w_px = (target_w_cm as f64 / 2.54 * 300.0).round() as u32;
    let target_h_px = (target_h_cm as f64 / 2.54 * 300.0).round() as u32;

    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let file_stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let parent_dir = input_path.parent().unwrap_or(Path::new(""));
    let temp_output = parent_dir.join(format!("{}_temp.{}", file_stem, ext));

    let mut args = vec![format!("{}[0]", input_path.to_string_lossy())];

    if mode == "crop" {
        args.push("-crop".to_string()); args.push(format!("{}x{}+{}+{}", pw, ph, px, py));
        args.push("+repage".to_string()); 
        args.push("-resize".to_string()); args.push(format!("{}x{}^", target_w_px, target_h_px)); 
        args.push("-gravity".to_string()); args.push("center".to_string()); 
        args.push("-background".to_string()); args.push("white".to_string());
        args.push("-extent".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
        // 🚀 核弹修复：强行拍扁图层，杜绝 PSD 预览失效
        args.push("-flatten".to_string());
    } else if mode == "resize" {
        args.push("-resize".to_string()); args.push(format!("{}x{}!", target_w_px, target_h_px));
        args.push("-background".to_string()); args.push("white".to_string());
        args.push("-flatten".to_string());
    } else {
        // Pad mode (等比留白)
        args.push("-resize".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
        args.push("-background".to_string()); args.push("white".to_string()); 
        args.push("-gravity".to_string()); args.push("center".to_string()); 
        args.push("-extent".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
        // 🚀 核弹修复：强行拍扁图层，杜绝 PSD 预览失效
        args.push("-flatten".to_string());
    }

    args.push("-density".to_string()); args.push("300".to_string()); args.push("-units".to_string()); args.push("PixelsPerInch".to_string());
    if ext.to_lowercase() == "tif" || ext.to_lowercase() == "tiff" { args.push("-compress".to_string()); args.push("None".to_string()); }
    args.push(temp_output.to_string_lossy().to_string());

    let output = magick_command().args(args).output().map_err(|e| format!("无法启动引擎: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_output);
        return Err(format!("引擎报错: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let final_path = input_path.to_path_buf();
    let final_name = input_path.file_name().unwrap_or_default().to_string_lossy().to_string();

    if let Err(_) = std::fs::rename(&temp_output, &final_path) {
        std::fs::copy(&temp_output, &final_path).map_err(|e| format!("覆盖原文件失败: {}", e))?;
        let _ = std::fs::remove_file(&temp_output);
    }

    Ok((final_path.to_string_lossy().to_string(), final_name))
}

// ==========================================
// 🌟 核心引擎 D：极速重命名
// ==========================================
#[tauri::command]
fn rename_files(files_to_process: Vec<Vec<String>>) -> Result<Vec<(String, String, String)>, String> {
    let mut results = Vec::new();
    for (index, file_info) in files_to_process.iter().enumerate() {
        if file_info.len() < 2 { continue; }
        let old_path_str = &file_info[0];
        let paper_type = &file_info[1];
        let old_path = Path::new(old_path_str);
        if !old_path.exists() { continue; }
        
        let parent = old_path.parent().unwrap_or(Path::new(""));
        let ext = old_path.extension().unwrap_or_default().to_string_lossy();
        
        let new_name = format!("{}-{}.{}", paper_type, index + 1, ext);
        let new_path = parent.join(&new_name);
        
        let target_layer = format!("{}[0]", old_path_str);
        let id_output = magick_command().args(["identify", "-format", "%x", &target_layer]).output();

        let mut has_valid_dpi = false;
        if let Ok(out) = id_output {
            if out.status.success() {
                let parsed_dpi: f32 = String::from_utf8_lossy(&out.stdout).trim().parse().unwrap_or(0.0);
                if parsed_dpi > 0.0 { has_valid_dpi = true; }
            }
        }

        if has_valid_dpi {
            if let Err(_) = std::fs::rename(&old_path, &new_path) {
                let _ = std::fs::copy(&old_path, &new_path); let _ = std::fs::remove_file(&old_path);
            }
        } else {
            let mut args = vec![
                format!("{}[0]", old_path_str), "-density".to_string(), "300".to_string(),
                "-units".to_string(), "PixelsPerInch".to_string()
            ];
            if ext.to_lowercase() == "tif" || ext.to_lowercase() == "tiff" {
                args.push("-compress".to_string()); args.push("LZW".to_string());
            }
            args.push(new_path.to_string_lossy().to_string());
            let output = magick_command().args(args).output();
            if let Ok(out) = output {
                if out.status.success() {
                    if old_path != new_path { let _ = std::fs::remove_file(&old_path); }
                } else {
                    if let Err(_) = std::fs::rename(&old_path, &new_path) {
                        let _ = std::fs::copy(&old_path, &new_path); let _ = std::fs::remove_file(&old_path);
                    }
                }
            } else {
                if let Err(_) = std::fs::rename(&old_path, &new_path) {
                    let _ = std::fs::copy(&old_path, &new_path); let _ = std::fs::remove_file(&old_path);
                }
            }
        }
        results.push((old_path_str.to_string(), new_path.to_string_lossy().to_string(), new_name));
    }
    Ok(results)
}

// ==========================================
// 🌟 核心引擎 E：图像多份复制裂变
// ==========================================
#[tauri::command]
async fn replicate_image(path_str: String, total_copies: u32) -> Result<Vec<String>, String> {
    let input_path = Path::new(&path_str);
    if !input_path.exists() || total_copies <= 1 { return Ok(vec![]); }

    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy().to_string();
    let parent = input_path.parent().unwrap_or(Path::new(""));

    let mut new_paths = Vec::new();
    let mut first_path: Option<std::path::PathBuf> = None;

    for i in 1..=total_copies {
        let new_name = format!("{}-{}-{}.{}", stem, i, total_copies, ext);
        let new_path = parent.join(&new_name);

        if i == 1 {
            std::fs::rename(input_path, &new_path).map_err(|e| e.to_string())?;
            first_path = Some(new_path.clone());
        } else {
            if let Some(ref src) = first_path {
                std::fs::copy(src, &new_path).map_err(|e| e.to_string())?;
            }
        }
        new_paths.push(new_path.to_string_lossy().to_string());
    }
    Ok(new_paths)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            rename_files, get_image_size, generate_thumbnail, process_image, replicate_image 
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}