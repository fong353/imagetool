#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;

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

    let img_dim = image::image_dimensions(input_path).map_err(|e| format!("读取尺寸失败: {}", e))?;
    let orig_w = img_dim.0 as f64; 
    let orig_h = img_dim.1 as f64;

    let px = (crop_x as f64 / 100.0 * orig_w).round() as u32;
    let py = (crop_y as f64 / 100.0 * orig_h).round() as u32;
    let pw = ((crop_w as f64 / 100.0 * orig_w).round() as u32).max(1);
    let ph = ((crop_h as f64 / 100.0 * orig_h).round() as u32).max(1);

    // 算准 300DPI 下目标尺寸的绝对像素
    let target_w_px = (target_w_cm as f64 / 2.54 * 300.0).round() as u32;
    let target_h_px = (target_h_cm as f64 / 2.54 * 300.0).round() as u32;

    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let file_stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let parent_dir = input_path.parent().unwrap_or(Path::new(""));
    let output_path = parent_dir.join(format!("{}_{}_输出.{}", file_stem, mode, ext));

    let mut args = vec![
        input_path.to_string_lossy().to_string(),
    ];

    if mode == "crop" {
        // ==================================================
        // 【物理裁切模式】 - 🌟 真正的印前霸道逻辑：强行铺满并切掉多余
        // ==================================================
        // 1. 切出用户画的框
        args.push("-crop".to_string());
        args.push(format!("{}x{}+{}+{}", pw, ph, px, py));
        args.push("+repage".to_string());
        
        // 2. 使用 ^ 符号等比放大，直到最短边刚好填满目标画板
        args.push("-resize".to_string());
        args.push(format!("{}x{}^", target_w_px, target_h_px)); 
        
        // 3. 居中对齐，像铡刀一样切掉四周溢出画板的画面，保证尺寸一毫米都不差！
        args.push("-gravity".to_string());
        args.push("center".to_string());
        args.push("-extent".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));

    } else {
        // ==================================================
        // 【等比留白模式】
        // ==================================================
        args.push("-resize".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));
        args.push("-background".to_string());
        args.push("white".to_string());
        args.push("-gravity".to_string());
        args.push("center".to_string());
        args.push("-extent".to_string());
        args.push(format!("{}x{}", target_w_px, target_h_px));
    }

    // 强行注入 300 DPI
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
    let img = image::image_dimensions(&path_str).map_err(|e| e.to_string())?;
    let w_cm = (img.0 as f32 / 300.0) * 2.54;
    let h_cm = (img.1 as f32 / 300.0) * 2.54;
    Ok(format!("{:.1} x {:.1} cm", w_cm, h_cm))
}

#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let path_str = path_str.replace("\\", "/");
    Ok(format!("asset://localhost/{}", path_str)) 
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