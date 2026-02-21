#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;
use base64::{engine::general_purpose, Engine as _};

#[tauri::command]
async fn process_image(
    path_str: String,
    mode: String,
    target_w_cm: f32,
    target_h_cm: f32,
    crop_x: f32,
    crop_y: f32,
    crop_w: f32,
    crop_h: f32,
) -> Result<String, String> {
    println!("🚀 收到处理请求！文件: {}, 模式: {}", path_str, mode);
    let input_path = Path::new(&path_str);
    if !input_path.exists() {
        return Err("文件不存在".to_string());
    }

    // 🌟 终极升级：使用 ImageMagick 强悍的 identify 探测任何工业格式的尺寸
    // 加上 [0] 是为了防止 PSD/PDF 多图层导致返回多个尺寸卡死
    let target_layer = format!("{}[0]", path_str);
    let output_dim = std::process::Command::new("magick")
        .args(["identify", "-format", "%w %h", &target_layer])
        .output()
        .map_err(|e| format!("启动探测引擎失败: {}", e))?;

    if !output_dim.status.success() {
        return Err("无法解析该文件的内部尺寸".to_string());
    }

    let dim_str = String::from_utf8_lossy(&output_dim.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    if dims.len() < 2 {
        return Err("获取图片尺寸异常".to_string());
    }
    
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
    let output_path = parent_dir.join(format!("{}_{}_输出.{}", file_stem, mode, ext));

    // 🌟 核心防线：输入路径强行附加 [0]，让 ImageMagick 把 PSD 自动拍平(Flatten)，只取最终视觉层！
    let mut args = vec![
        format!("{}[0]", input_path.to_string_lossy()) 
    ];

    if mode == "crop" {
        args.push("-crop".to_string());
        args.push(format!("{}x{}+{}+{}", pw, ph, px, py));
        args.push("+repage".to_string());
        args.push("-resize".to_string());
        args.push(format!("{}x{}^", target_w_px, target_h_px)); 
        args.push("-gravity".to_string());
        args.push("center".to_string());
        args.push("-extent".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));
    } else if mode == "resize" {
        args.push("-resize".to_string());
        args.push(format!("{}x{}!", target_w_px, target_h_px));
    } else {
        args.push("-resize".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));
        args.push("-background".to_string());
        args.push("white".to_string());
        args.push("-gravity".to_string());
        args.push("center".to_string());
        args.push("-extent".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));
    }

    args.push("-density".to_string());
    args.push("300".to_string());
    args.push("-units".to_string());
    args.push("PixelsPerInch".to_string());

    if ext.to_lowercase() == "tif" || ext.to_lowercase() == "tiff" {
        args.push("-compress".to_string());
        args.push("LZW".to_string());
    }

    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new("magick")
        .args(args)
        .output()
        .map_err(|e| format!("无法启动系统 ImageMagick 引擎: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("引擎底层报错: {}", err_msg));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    // 同样使用 magick identify 替换原有探针
    let target_layer = format!("{}[0]", path_str);
    let output = std::process::Command::new("magick")
        .args(["identify", "-format", "%w %h", &target_layer])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("解析失败".to_string());
    }

    let dim_str = String::from_utf8_lossy(&output.stdout);
    let dims: Vec<&str> = dim_str.trim().split_whitespace().collect();
    if dims.len() == 2 {
        let w_px: f32 = dims[0].parse().unwrap_or(0.0);
        let h_px: f32 = dims[1].parse().unwrap_or(0.0);
        let w_cm = (w_px / 300.0) * 2.54;
        let h_cm = (h_px / 300.0) * 2.54;
        Ok(format!("{:.1} x {:.1} cm", w_cm, h_cm))
    } else {
        Err("解析尺寸失败".to_string())
    }
}

#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    let ext = Path::new(&path_str).extension().unwrap_or_default().to_string_lossy().to_lowercase();
    
    // 针对普通格式，直接走 Tauri 高速资产协议
    if ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" {
        #[cfg(target_os = "windows")]
        let path_str = path_str.replace("\\", "/");
        return Ok(format!("asset://localhost/{}", path_str));
    }

    // 🌟 终极视觉方案：针对 PSD/TIF 等浏览器不认识的工业格式
    // 我们让引擎在内存里极速抽一张它的第一层，压平图层，转成 Base64 喂给前端显示
    let target_layer = format!("{}[0]", path_str);
    let output = std::process::Command::new("magick")
        .args([
            &target_layer,
            "-background", "white",
            "-flatten",         // 强行合并所有图层，铺在白底上
            "-resize", "400x400>", // 防卡死缩放，最长边不超过 400
            "-strip",           // 剥离所有多余的 EXIF 垃圾信息加速传输
            "jpeg:-"            // 🌟 核心修复：指示输出 JPG 数据流到系统 stdout
        ])
        .output()
        .map_err(|e| format!("引擎启动失败: {}", e))?;

    if output.status.success() {
        // 将内存中的 JPG 图像流编码为 Base64
        let b64 = general_purpose::STANDARD.encode(&output.stdout);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    } else {
        // 如果出错，把报错信息打印到终端方便排查
        let err_msg = String::from_utf8_lossy(&output.stderr);
        println!("❌ PSD 预览生成失败: {}", err_msg);
        Err("生成预览图失败".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            process_image,
            get_image_size,
            generate_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}