use std::io::Read;
use std::path::Path;
use base64::{engine::general_purpose, Engine as _};

// ==========================================
// 🌟 辅助引擎 1：6 位 Base62 字符串转换
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
// 🌟 辅助引擎 2：极速计算文件的 CRC32 内容指纹 (光速进化版)
// ==========================================
fn get_file_crc32_base62(path: &Path) -> String {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return "000000".to_string(), 
    };
    
    let mut hasher = crc32fast::Hasher::new();
    
    // 提速引擎 1：混入文件物理大小
    if let Ok(metadata) = file.metadata() {
        hasher.update(&metadata.len().to_le_bytes());
    }
    
    // 提速引擎 2：只抽样文件头部的 256KB 核心数据
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
// 🌟 核心引擎 A：图像排版与导出 (直接覆盖防暴走 + 智能指纹更新)
// ==========================================
#[tauri::command]
async fn process_image(
    path_str: String, mode: String, target_w_cm: f32, target_h_cm: f32,
    crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32,
) -> Result<(String, String), String> { 
    let input_path = Path::new(&path_str);
    if !input_path.exists() { return Err("文件不存在".to_string()); }

    let target_layer = format!("{}[0]", path_str);
    let output_dim = std::process::Command::new("magick")
        .args(["identify", "-format", "%w %h", &target_layer])
        .output()
        .map_err(|e| format!("启动探测引擎失败: {}", e))?;

    if !output_dim.status.success() { return Err("无法解析该文件的内部尺寸".to_string()); }

    let dim_str = String::from_utf8_lossy(&output_dim.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    if dims.len() < 2 { return Err("获取图片尺寸异常".to_string()); }
    
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

    let output = std::process::Command::new("magick").args(args).output()
        .map_err(|e| format!("无法启动引擎: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&temp_output);
        return Err(format!("引擎底层报错: {}", String::from_utf8_lossy(&output.stderr)));
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
// 🌟 核心引擎 B：带有内容指纹的智能 DPI 改名
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
        let id_output = std::process::Command::new("magick")
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
                let _ = std::fs::copy(&old_path, &new_path);
                let _ = std::fs::remove_file(&old_path);
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
            let output = std::process::Command::new("magick").args(args).output();
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
// 🌟 核心引擎 C：万能探针与内存级缩略图生成
// ==========================================
#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    let target_layer = format!("{}[0]", path_str);
    let output = std::process::Command::new("magick")
        .args(["identify", "-format", "%w %h %x %U", &target_layer])
        .output().map_err(|e| e.to_string())?;

    if !output.status.success() { return Err("解析失败".to_string()); }
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
    } else { Err("解析尺寸失败".to_string()) }
}

#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    let ext = Path::new(&path_str).extension().unwrap_or_default().to_string_lossy().to_lowercase();
    if ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" {
        #[cfg(target_os = "windows")] let final_path = path_str.replace("\\", "/");
        #[cfg(not(target_os = "windows"))] let final_path = path_str;
        return Ok(format!("asset://localhost/{}", final_path));
    }
    let target_layer = format!("{}[0]", path_str);
    let output = std::process::Command::new("magick")
        .args([&target_layer, "-background", "white", "-flatten", "-resize", "400x400>", "-strip", "jpeg:-"])
        .output().map_err(|e| format!("引擎启动失败: {}", e))?;

    if output.status.success() {
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&output.stdout)))
    } else { Err("生成预览图失败".to_string()) }
}

// ==========================================
// 🌟 核心挂载：Tauri 入口
// ==========================================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            rename_files, 
            get_image_size, 
            generate_thumbnail, 
            process_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}