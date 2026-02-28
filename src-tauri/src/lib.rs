use std::path::Path;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use tauri::Manager;

// ==========================================
// 🌟 辅助引擎：跨平台 Magick 唤醒器
// ==========================================
// ==========================================
// 🌟 辅助引擎：跨平台 Magick 唤醒器 (终极无黑框版)
// ==========================================
fn magick_command() -> std::process::Command {
    #[cfg(target_os = "macos")]
    {
        if Path::new("/opt/homebrew/bin/magick").exists() {
            return std::process::Command::new("/opt/homebrew/bin/magick");
        } else if Path::new("/usr/local/bin/magick").exists() {
            return std::process::Command::new("/usr/local/bin/magick");
        }
        std::process::Command::new("magick")
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt; // 引入 Windows 专属扩展
        let mut cmd = std::process::Command::new("magick");
        cmd.creation_flags(0x08000000); // 🚀 核心魔法：CREATE_NO_WINDOW，彻底隐藏黑框！
        cmd
    }
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
// 🌟 新增：结构化元数据探针（供前端获取 dpi 等信息）
// ==========================================
#[derive(Serialize)]
struct ImageMeta {
    width_px: u32,
    height_px: u32,
    dpi: f32,
    unit: String,
}

#[tauri::command]
fn get_image_meta(path_str: String) -> Result<ImageMeta, String> {
    let output = magick_command()
        .args(["identify", "-format", "%w %h %x %U\n", &path_str])
        .output().map_err(|e| format!("启动探测引擎失败: {}", e))?;

    if !output.status.success() { return Err("解析尺寸失败".to_string()); }

    let dim_str = String::from_utf8_lossy(&output.stdout);
    let first_line = dim_str.lines().next().unwrap_or("");
    let dims: Vec<&str> = first_line.trim().split_whitespace().collect();

    if dims.len() >= 2 {
        let w_px: u32 = dims[0].parse().unwrap_or(0);
        let h_px: u32 = dims[1].parse().unwrap_or(0);
        let mut dpi: f32 = 300.0;
        let mut unit = String::from("PixelsPerInch");

        if dims.len() >= 3 {
            let parsed_dpi: f32 = dims[2].parse().unwrap_or(0.0);
            if parsed_dpi > 0.0 {
                dpi = parsed_dpi;
                if dims.len() >= 4 {
                    unit = dims[3].to_string();
                    if unit.to_lowercase().contains("centimeter") {
                        // 当单位是每厘米时，将单位含义与 DPI 对齐
                        dpi *= 2.54;
                    }
                }
            }
        }

        Ok(ImageMeta { width_px: w_px, height_px: h_px, dpi, unit })
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
        {
            // Windows 必须走 http://asset.localhost/ 协议
            // 并且要把反斜杠换成斜杠，把盘符的冒号(如 C:) 转码成 C%3A
            let final_path = path_str.replace("\\", "/").replacen(":", "%3A", 1);
            return Ok(format!("http://asset.localhost/{}", final_path));
        }
        #[cfg(not(target_os = "windows"))]
        {
            // Mac 保持原样，极其稳定
            return Ok(format!("asset://localhost/{}", path_str));
        }
    }

    // 处理 PSD/TIFF 等需要借用 Magick 算力的情况（生成 Base64）
    let target_layer = format!("{}[0]", path_str);
    let output = magick_command()
        .args([&target_layer, "-background", "white", "-flatten", "-resize", "400x400>", "-strip", "jpeg:-"])
        .output().map_err(|e| format!("引擎启动失败: {}", e))?;

    if output.status.success() {
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&output.stdout)))
    } else { 
        Err("生成预览图失败".to_string()) 
    }
}

// ==========================================
// 🌟 核心引擎 C：图像排版与导出 (PSD 强制合并图层防破图)
// ==========================================
#[tauri::command]
async fn process_image(
    path_str: String, mode: String, target_w_cm: f32, target_h_cm: f32,
    crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32,
    border_top_cm: f32,
    border_right_cm: f32,
    border_bottom_cm: f32,
    border_left_cm: f32,
) -> Result<(String, String), String> { 
    let input_path = Path::new(&path_str);
    if !input_path.exists() { return Err("文件不存在".to_string()); }

    let target_layer = format!("{}[0]", path_str);
    let output_dim = magick_command().args(["identify", "-format", "%w %h %x %U", &target_layer]).output().map_err(|e| format!("启动探测引擎失败: {}", e))?;
    if !output_dim.status.success() { return Err("无法解析尺寸".to_string()); }

    let dim_str = String::from_utf8_lossy(&output_dim.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    if dims.len() < 2 { return Err("获取尺寸异常".to_string()); }
    
    let orig_w: f64 = dims[0].parse().unwrap_or(1.0);
    let orig_h: f64 = dims[1].parse().unwrap_or(1.0);
    let mut src_dpi: f64 = 300.0;
    if dims.len() >= 3 {
        let parsed_dpi: f64 = dims[2].parse().unwrap_or(0.0);
        if parsed_dpi > 0.0 {
            src_dpi = parsed_dpi;
            if dims.len() >= 4 && dims[3].to_lowercase().contains("centimeter") {
                src_dpi *= 2.54;
            }
        }
    }

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
    } else if mode == "border" {
        let cm_to_px = |cm: f32| -> i32 { (((cm as f64) / 2.54) * src_dpi).round() as i32 };

        let top_px_raw = cm_to_px(border_top_cm);
        let right_px_raw = cm_to_px(border_right_cm);
        let bottom_px_raw = cm_to_px(border_bottom_cm);
        let left_px_raw = cm_to_px(border_left_cm);

        let add_top = top_px_raw.max(0) as u32;
        let add_right = right_px_raw.max(0) as u32;
        let add_bottom = bottom_px_raw.max(0) as u32;
        let add_left = left_px_raw.max(0) as u32;

        let crop_top_raw = (-top_px_raw).max(0) as u32;
        let crop_right_raw = (-right_px_raw).max(0) as u32;
        let crop_bottom_raw = (-bottom_px_raw).max(0) as u32;
        let crop_left_raw = (-left_px_raw).max(0) as u32;

        let expanded_w = (orig_w.round() as u32)
            .saturating_add(add_left)
            .saturating_add(add_right)
            .max(1);
        let expanded_h = (orig_h.round() as u32)
            .saturating_add(add_top)
            .saturating_add(add_bottom)
            .max(1);

        let max_crop_w = expanded_w.saturating_sub(1);
        let crop_left = crop_left_raw.min(max_crop_w);
        let remaining_w = expanded_w.saturating_sub(crop_left).max(1);
        let crop_right = crop_right_raw.min(remaining_w.saturating_sub(1));

        let max_crop_h = expanded_h.saturating_sub(1);
        let crop_top = crop_top_raw.min(max_crop_h);
        let remaining_h = expanded_h.saturating_sub(crop_top).max(1);
        let crop_bottom = crop_bottom_raw.min(remaining_h.saturating_sub(1));

        let final_w = expanded_w
            .saturating_sub(crop_left)
            .saturating_sub(crop_right)
            .max(1);
        let final_h = expanded_h
            .saturating_sub(crop_top)
            .saturating_sub(crop_bottom)
            .max(1);

        args.push("-background".to_string()); args.push("white".to_string());
        args.push("-gravity".to_string()); args.push("northwest".to_string());
        args.push("-splice".to_string()); args.push(format!("{}x{}", add_left, add_top));
        args.push("-gravity".to_string()); args.push("southeast".to_string());
        args.push("-splice".to_string()); args.push(format!("{}x{}", add_right, add_bottom));
        args.push("-gravity".to_string()); args.push("northwest".to_string());
        args.push("-extent".to_string()); args.push(format!("{}x{}", expanded_w, expanded_h));

        if crop_left > 0 || crop_right > 0 || crop_top > 0 || crop_bottom > 0 {
            args.push("-gravity".to_string()); args.push("northwest".to_string());
            args.push("-crop".to_string());
            args.push(format!("{}x{}+{}+{}", final_w, final_h, crop_left, crop_top));
            args.push("+repage".to_string());
        }

        args.push("-flatten".to_string());
    } else if mode == "mirror" {
        let top_px = ((((border_top_cm.max(0.0)) as f64) / 2.54) * src_dpi).round() as u32;
        let right_px = ((((border_right_cm.max(0.0)) as f64) / 2.54) * src_dpi).round() as u32;
        let bottom_px = ((((border_bottom_cm.max(0.0)) as f64) / 2.54) * src_dpi).round() as u32;
        let left_px = ((((border_left_cm.max(0.0)) as f64) / 2.54) * src_dpi).round() as u32;

        let expanded_w = (orig_w.round() as u32)
            .saturating_add(left_px)
            .saturating_add(right_px)
            .max(1);
        let expanded_h = (orig_h.round() as u32)
            .saturating_add(top_px)
            .saturating_add(bottom_px)
            .max(1);

        args.push("-virtual-pixel".to_string()); args.push("mirror".to_string());
        args.push("-set".to_string());
        args.push("option:distort:viewport".to_string());
        args.push(format!("{}x{}-{}-{}", expanded_w, expanded_h, left_px, top_px));
        args.push("-filter".to_string()); args.push("point".to_string());
        args.push("-distort".to_string()); args.push("SRT".to_string()); args.push("0".to_string());
        args.push("+repage".to_string());
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
        .setup(|app| {
            let version = app.package_info().version.to_string();
            let normalized_version = version.strip_prefix('v').unwrap_or(&version);
            let title = format!("墨印众合-imagetool v{}", normalized_version);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            rename_files, get_image_size, get_image_meta, generate_thumbnail, process_image, replicate_image 
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}