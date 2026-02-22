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
    let input_path = std::path::Path::new(&path_str);
    if !input_path.exists() {
        return Err("文件不存在".to_string());
    }

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
    let parent_dir = input_path.parent().unwrap_or(std::path::Path::new(""));
    
    // 🌟 核心改动 1：使用“安全临时文件”过渡
    let temp_output = parent_dir.join(format!("{}_temp.{}", file_stem, ext));

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

    // 指示引擎先将结果吐到临时文件里
    args.push(temp_output.to_string_lossy().to_string());

    let output = std::process::Command::new("magick")
        .args(args)
        .output()
        .map_err(|e| format!("无法启动引擎: {}", e))?;

    if !output.status.success() {
        // 如果处理失败，悄悄删掉破损的临时文件，保护原文件不动
        let _ = std::fs::remove_file(&temp_output);
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("引擎底层报错: {}", err_msg));
    }

    // 🌟 核心改动 2：完美掩人耳目的“原名覆盖”
    // 只有 100% 处理成功后，才瞬间拿临时文件替换掉原文件！
    if let Err(_) = std::fs::rename(&temp_output, &input_path) {
        std::fs::copy(&temp_output, &input_path).map_err(|e| format!("覆盖原文件失败: {}", e))?;
        let _ = std::fs::remove_file(&temp_output);
    }

    Ok(input_path.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_files(files_to_process: Vec<Vec<String>>) -> Result<Vec<(String, String, String)>, String> {
    let mut results = Vec::new();
    
    for (index, file_info) in files_to_process.iter().enumerate() {
        if file_info.len() < 2 { continue; }
        let old_path_str = &file_info[0];
        let paper_type = &file_info[1];
        
        let old_path = std::path::Path::new(old_path_str);
        if !old_path.exists() { continue; }
        
        let parent = old_path.parent().unwrap_or(std::path::Path::new(""));
        let ext = old_path.extension().unwrap_or_default().to_string_lossy();
        
        // 拼接新名字
        let new_name = format!("{}-{}.{}", paper_type, index + 1, ext);
        let new_path = parent.join(&new_name);
        
        // 🌟 核心升级：改名的同时，用引擎强行洗一遍头文件，注入 300 DPI！
        let mut args = vec![
            format!("{}[0]", old_path_str), // 防多图层
            "-density".to_string(), "300".to_string(),
            "-units".to_string(), "PixelsPerInch".to_string()
        ];
        
        // 如果是 TIF，保留 LZW 压缩
        if ext.to_lowercase() == "tif" || ext.to_lowercase() == "tiff" {
            args.push("-compress".to_string());
            args.push("LZW".to_string());
        }
        args.push(new_path.to_string_lossy().to_string());

        let output = std::process::Command::new("magick").args(args).output();

        if let Ok(out) = output {
            if out.status.success() {
                // 处理成功，如果名字确实变了，就把旧的删掉
                if old_path != new_path {
                    let _ = std::fs::remove_file(&old_path);
                }
            } else {
                // 引擎意外报错，退化为普通物理改名（兜底机制）
                if let Err(_) = std::fs::rename(&old_path, &new_path) {
                    let _ = std::fs::copy(&old_path, &new_path);
                    let _ = std::fs::remove_file(&old_path);
                }
            }
        } else {
            if let Err(_) = std::fs::rename(&old_path, &new_path) {
                let _ = std::fs::copy(&old_path, &new_path);
                let _ = std::fs::remove_file(&old_path);
            }
        }
        
        results.push((
            old_path_str.to_string(), 
            new_path.to_string_lossy().to_string(), 
            new_name
        ));
    }
    
    Ok(results)
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
            generate_thumbnail,
            rename_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
