use std::fs;
use std::path::Path;
use image::{GenericImageView, ImageBuffer, Rgba, imageops::FilterType};
use base64::{Engine as _, engine::general_purpose::STANDARD};

// ... 你的原始 DPI 获取逻辑保持不变 ...
fn get_dpi_from_exif(path: &Path) -> Option<f32> {
    let file = fs::File::open(path).ok()?;
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = exifreader.read_from_container(&mut bufreader).ok()?;
    let x_res = exif.get_field(exif::Tag::XResolution, exif::In::PRIMARY)?;
    let res_unit = exif.get_field(exif::Tag::ResolutionUnit, exif::In::PRIMARY);
    if let exif::Value::Rational(ref vec) = x_res.value {
        if !vec.is_empty() {
            let dpi_val = vec[0].num as f32 / vec[0].denom as f32;
            let mut is_cm = false;
            if let Some(u) = res_unit {
                if let exif::Value::Short(ref u_vec) = u.value {
                    if !u_vec.is_empty() && u_vec[0] == 3 { is_cm = true; }
                }
            }
            return Some(if is_cm { dpi_val * 2.54 } else { dpi_val });
        }
    }
    None
}

fn get_dpi_from_jfif(path: &Path) -> Option<f32> {
    if let Ok(data) = fs::read(path) {
        let mut i = 0;
        while i + 4 < data.len() {
            if data[i] == 0xFF {
                let marker = data[i+1];
                if marker == 0xD8 || marker == 0x00 || marker == 0xFF { i += 1; continue; }
                if marker == 0xDA { break; }
                let len = ((data[i+2] as usize) << 8) | (data[i+3] as usize);
                if marker == 0xE0 && i + 14 < data.len() && &data[i+4..i+9] == b"JFIF\0" {
                    let units = data[i+11];
                    let x_density = ((data[i+12] as u16) << 8) | (data[i+13] as u16);
                    if x_density > 0 {
                        if units == 1 { return Some(x_density as f32); } 
                        else if units == 2 { return Some(x_density as f32 * 2.54); }
                    }
                    break;
                }
                i += 2 + len;
            } else { i += 1; }
        }
    }
    None
}

fn get_real_dpi(path: &Path) -> f32 {
    if let Some(dpi) = get_dpi_from_exif(path) { return dpi; }
    if let Some(dpi) = get_dpi_from_jfif(path) { return dpi; }
    300.0 // 默认保底 300 DPI
}

// 获取尺寸
#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    let path = Path::new(&path_str);
    let (width, height) = image::image_dimensions(path).map_err(|e| e.to_string())?;
    let dpi = get_real_dpi(path);
    let width_cm = (width as f32 / dpi) * 2.54;
    let height_cm = (height as f32 / dpi) * 2.54;
    Ok(format!("{:.1} x {:.1} cm", width_cm, height_cm))
}

// 🌟 新增：全局缩略图生成引擎
#[tauri::command]
fn generate_thumbnail(path_str: String) -> Result<String, String> {
    let img = image::open(&path_str).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(800, 800);
    let mut buf = std::io::Cursor::new(Vec::new());
    thumb.write_to(&mut buf, image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(buf.into_inner())))
}

// 🌟 新增：物理裁切与留白引擎
#[tauri::command]
fn process_image(
    path_str: String, mode: String, target_w_cm: f32, target_h_cm: f32,
    crop_x: f32, crop_y: f32, crop_w: f32, crop_h: f32
) -> Result<String, String> {
    let path = Path::new(&path_str);
    let mut img = image::open(path).map_err(|e| e.to_string())?;
    
    let target_w_px = ((target_w_cm / 2.54) * 300.0).round() as u32;
    let target_h_px = ((target_h_cm / 2.54) * 300.0).round() as u32;

    let processed_img = if mode == "crop" {
        let (orig_w, orig_h) = img.dimensions();
        let cx = (orig_w as f32 * (crop_x / 100.0)) as u32;
        let cy = (orig_h as f32 * (crop_y / 100.0)) as u32;
        let cw = (orig_w as f32 * (crop_w / 100.0)) as u32;
        let ch = (orig_h as f32 * (crop_h / 100.0)) as u32;

        let cropped = image::imageops::crop(&mut img, cx, cy, cw, ch).to_image();
        let dynamic_img = image::DynamicImage::ImageRgba8(cropped);
        dynamic_img.resize_exact(target_w_px, target_h_px, FilterType::Lanczos3)
    } else {
        let mut bg = ImageBuffer::from_pixel(target_w_px, target_h_px, Rgba([255, 255, 255, 255]));
        let resized = img.resize(target_w_px, target_h_px, FilterType::Lanczos3);
        let (rw, rh) = resized.dimensions();
        let offset_x = (target_w_px.saturating_sub(rw)) / 2;
        let offset_y = (target_h_px.saturating_sub(rh)) / 2;
        image::imageops::overlay(&mut bg, &resized, offset_x as i64, offset_y as i64);
        image::DynamicImage::ImageRgba8(bg)
    };

    let parent = path.parent().unwrap_or(Path::new(""));
    let new_name = format!("Processed_{}", path.file_name().unwrap().to_string_lossy());
    let new_path = parent.join(&new_name);
    
    // 强制写入DPI
    processed_img.save(&new_path).map_err(|e| e.to_string())?;
    Ok(new_path.to_string_lossy().to_string())
}

// ... 你的重命名逻辑保持不变 ...
#[tauri::command]
fn rename_files(files_to_process: Vec<(String, String)>) -> Result<Vec<(String, String, String)>, String> {
    let mut results = Vec::new();
    for (index, (path_str, paper_type)) in files_to_process.iter().enumerate() {
        let path = Path::new(path_str);
        if !path.exists() { continue; }
        let parent = path.parent().unwrap_or(Path::new(""));
        let ext = path.extension().unwrap_or_default().to_str().unwrap_or("jpg");
        let mut new_name = format!("{}-{}.{}", paper_type, index + 1, ext);
        let mut new_path = parent.join(&new_name);
        let mut collision_counter = 1;
        while new_path.exists() {
            new_name = format!("{}-{}_{}.{}", paper_type, index + 1, collision_counter, ext);
            new_path = parent.join(&new_name);
            collision_counter += 1;
        }
        match fs::rename(path, &new_path) {
            Ok(_) => {},
            Err(e) => return Err(e.to_string())
        }
        results.push((path_str.clone(), new_path.to_string_lossy().to_string(), new_name));
    }
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // 🌟 确保注册了所有的指令
        .invoke_handler(tauri::generate_handler![
            rename_files, 
            get_image_size, 
            generate_thumbnail, 
            process_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}