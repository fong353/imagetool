use std::io::Read;
use std::path::{Path, PathBuf};
use base64::{engine::general_purpose, Engine as _};

// ==========================================
// 🌟 辅助引擎 0：跨平台 Magick 唤醒器 (解决 Mac 打包后环境变量丢失的致命 BUG)
// ==========================================
fn magick_command() -> std::process::Command {
    #[cfg(target_os = "macos")]
    {
        // M1/M2/M3 芯片 Mac 的 Homebrew 默认路径
        if Path::new("/opt/homebrew/bin/magick").exists() {
            return std::process::Command::new("/opt/homebrew/bin/magick");
        } 
        // Intel 芯片 Mac 的 Homebrew 默认路径
        else if Path::new("/usr/local/bin/magick").exists() {
            return std::process::Command::new("/usr/local/bin/magick");
        }
    }
    // Windows 或其他系统，直接调用环境变量
    std::process::Command::new("magick")
}

// ==========================================
// 🌟 辅助引擎 1：Base62 转换
// ==========================================
fn u32_to_base62_6chars(mut num: u32) -> String {
    let alphabet = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    if num == 0 { return "000000".to_string(); }
    let mut res = String::new();
    while num > 0 {
        res.push(alphabet[(num % 62) as usize] as char);
        num /= 62;
    }
    let reversed: String = res.chars().rev().collect();
    format!("{:0>6}", reversed) 
}

// ==========================================
// 🌟 辅助引擎 2：极速计算指纹
// ==========================================
fn get_file_crc32_base62(path: &Path) -> String {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return "000000".to_string(), 
    };
    let mut hasher = crc32fast::Hasher::new();
    if let Ok(metadata) = file.metadata() {
        hasher.update(&metadata.len().to_le_bytes());
    }
    let mut buffer = [0; 65536]; 
    let mut total_read = 0;
    while total_read < 256 * 1024 { 
        match file.read(&mut buffer) {
            Ok(0) => break, 
            Ok(count) => {
                hasher.update(&buffer[..count]);
                total_read += count;
            },
            Err(_) => break,
        }
    }
    u32_to_base62_6chars(hasher.finalize())
}

// ==========================================
// 🌟 核心引擎 A：万能探针 (探测物理尺寸)
// ==========================================
#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    let target_layer = format!("{}[0]", path_str);
    
    // 🚀 使用探测器唤醒引擎
    let output = magick_command()
        .args(["identify", "-format", "%w %h %x %U", &target_layer])
        .output().map_err(|e| format!("启动探测引擎失败: {}", e))?;

    if !output.status.success() { 
        return Err("解析尺寸失败".to_string()); 
    }
    
    let dim_str = String::from_utf8_lossy(&output.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    
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
    } else { 
        Err("解析尺寸失败".to_string()) 
    }
}

// ==========================================
// 🌟 核心引擎 B：终极预览图生成 (全量 Base64 绕过 Mac 沙盒)
// ==========================================
#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    let target_layer = format!("{}[0]", path_str);
    
    // 🚀 使用探测器唤醒引擎
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
// 🌟 核心引擎 C：图像排版与导出
// ==========================================
#[tauri::command]
async fn process_image(
    path_str: String, mode: String, target_w_cm: f32, target_h_cm: f32,
    crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32,
) -> Result<(String, String), String> { 
    let input_path = Path::new(&path_str);
    if !input_path.exists() { return Err("文件不存在".to_string()); }

    let target_layer = format!("{}[0]", path_str);
    
    // 🚀 使用探测器
    let output_dim = magick_command()
        .args(["identify", "-format", "%w %h", &target_layer])
        .output()
        .map_err(|e| format!("启动探测引擎失败: {}", e))?;

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
        args.push("+repage".to_string()); args.push("-resize".to_string());
        args.push(format!("{}x{}^", target_w_px, target_h_px)); 
        args.push("-gravity".to_string()); args.push("center".to_string());
        args.push("-extent".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
    } else if mode == "resize" {
        args.push("-resize".to_string()); args.push(format!("{}x{}!", target_w_px, target_h_px));
    } else {
        args.push("-resize".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
        args.push("-background".to_string()); args.push("white".to_string());
        args.push("-gravity".to_string()); args.push("center".to_string());
        args.push("-extent".to_string()); args.push(format!("{}x{}", target_w_px, target_h_px));
    }

    args.push("-density".to_string()); args.push("300".to_string());
    args.push("-units".to_string()); args.push("PixelsPerInch".to_string());
    if ext.to_lowercase() == "tif" || ext.to_lowercase() == "tiff" {
        args.push("-compress".to_string()); args.push("None".to_string()); 
    }
    args.push(temp_output.to_string_lossy().to_string());

    // 🚀 使用探测器
    let output = magick_command().args(args).output()
        .map_err(|e| format!("无法启动引擎: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_output);
        return Err(format!("引擎报错: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let new_fingerprint = get_file_crc32_base62(&temp_output);
    let new_stem = if let Some(idx) = file_stem.rfind('_') {
        if file_stem.len() - idx == 7 { format!("{}_{}", &file_stem[..idx], new_fingerprint) } 
        else { format!("{}_{}", file_stem, new_fingerprint) }
    } else { format!("{}_{}", file_stem, new_fingerprint) };

    let new_name = format!("{}.{}", new_stem, ext);
    let final_path = parent_dir.join(&new_name);

    if let Err(_) = std::fs::rename(&temp_output, &final_path) {
        std::fs::copy(&temp_output, &final_path).map_err(|e| format!("覆盖原文件失败: {}", e))?;
        let _ = std::fs::remove_file(&temp_output);
    }
    if final_path != input_path && input_path.exists() { let _ = std::fs::remove_file(&input_path); }

    Ok((final_path.to_string_lossy().to_string(), new_name))
}

// ==========================================
// 🌟 核心引擎 D：纸张重命名
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
        let fingerprint = get_file_crc32_base62(&old_path);
        let new_name = format!("{}-{}_{}.{}", paper_type, index + 1, fingerprint, ext);
        let new_path = parent.join(&new_name);
        
        let target_layer = format!("{}[0]", old_path_str);
        
        // 🚀 使用探测器
        let id_output = magick_command()
            .args(["identify", "-format", "%x", &target_layer]).output();

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
            
            // 🚀 使用探测器
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
// 🌟 核心引擎 E：图像复制裂变
// ==========================================
#[tauri::command]
async fn replicate_image(path_str: String, total_copies: u32) -> Result<Vec<String>, String> {
    let input_path = Path::new(&path_str);
    if !input_path.exists() || total_copies <= 1 { return Ok(vec![]); }

    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy().to_string();
    let parent = input_path.parent().unwrap_or(Path::new(""));

    let (base, finger) = if let Some(idx) = stem.rfind('_') {
        if stem.len() - idx == 7 { (&stem[..idx], &stem[idx..]) } else { (stem.as_str(), "") }
    } else { (stem.as_str(), "") };

    let mut new_paths = Vec::new();
    let mut first_path: Option<PathBuf> = None;

    for i in 1..=total_copies {
        let new_name = format!("{}-{}-{}{}.{}", base, i, total_copies, finger, ext);
        let new_path = parent.join(new_name);

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