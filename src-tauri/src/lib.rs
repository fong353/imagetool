use std::fs;
use std::path::Path;

// --- 精准读取模块 ---
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

#[tauri::command]
fn get_image_size(path_str: String) -> Result<String, String> {
    let path = Path::new(&path_str);
    let (width, height) = image::image_dimensions(path).map_err(|e| e.to_string())?;
    
    let dpi = get_real_dpi(path);
    let width_cm = (width as f32 / dpi) * 2.54;
    let height_cm = (height as f32 / dpi) * 2.54;
    
    Ok(format!("{:.1} x {:.1} cm", width_cm, height_cm))
}

// --- 安全重命名 + 强力保底注入模块 ---
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

        let is_jpg = ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg");
        let mut injected = false;

        // 💡 强力保底机制：如果是 JPG，检查它有没有任意一种标头
        if is_jpg {
            let has_exif = get_dpi_from_exif(path).is_some();
            let has_jfif = get_dpi_from_jfif(path).is_some();

            // 如果两个都没有，说明是裸图，强行注入 300 DPI APP0 标头
            if !has_exif && !has_jfif {
                if let Ok(data) = fs::read(path) {
                    if data.len() > 2 && data[0] == 0xFF && data[1] == 0xD8 {
                        let mut out = Vec::with_capacity(data.len() + 18);
                        out.extend_from_slice(&[0xFF, 0xD8]);
                        
                        let jfif = vec![
                            0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00,
                            0x01, 0x01, 0x01, // 0x01 = DPI
                            0x01, 0x2C,       // X分辩率: 300 (16进制 012C)
                            0x01, 0x2C,       // Y分辩率: 300 (16进制 012C)
                            0x00, 0x00
                        ];
                        out.extend_from_slice(&jfif);
                        out.extend_from_slice(&data[2..]); // 安全拼接剩下的原始数据
                        
                        if fs::write(&new_path, out).is_ok() {
                            fs::remove_file(path).ok();
                            injected = true;
                        }
                    }
                }
            }
        }

        // 如果不是裸图，或者注入失败，或者不是 JPG，则走常规防冲突改名
        if !injected {
            match fs::rename(path, &new_path) {
                Ok(_) => {},
                Err(e) => return Err(e.to_string())
            }
        }
        
        results.push((path_str.clone(), new_path.to_string_lossy().to_string(), new_name));
    }

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![rename_files, get_image_size])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}