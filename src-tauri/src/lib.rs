use std::fs;
use std::path::Path;

// --- 精准读取模块 (保持不变，用于界面显示尺寸) ---
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

// --- 💡 全新的安全重命名模块 ---
#[tauri::command]
fn rename_files(files_to_process: Vec<(String, String)>) -> Result<Vec<(String, String, String)>, String> {
    let mut results = Vec::new();

    for (index, (path_str, paper_type)) in files_to_process.iter().enumerate() {
        let path = Path::new(path_str);
        if !path.exists() { continue; }

        let parent = path.parent().unwrap_or(Path::new(""));
        let ext = path.extension().unwrap_or_default().to_str().unwrap_or("jpg");
        
        // 初始目标文件名：类目-序号.后缀
        let mut new_name = format!("{}-{}.{}", paper_type, index + 1, ext);
        let mut new_path = parent.join(&new_name);

        // 💡 核心防冲突逻辑：如果同名文件已存在，则追加 _1, _2 ... 序号
        let mut collision_counter = 1;
        while new_path.exists() {
            new_name = format!("{}-{}_{}.{}", paper_type, index + 1, collision_counter, ext);
            new_path = parent.join(&new_name);
            collision_counter += 1;
        }

        // 直接物理重命名，不修改任何文件内部数据
        match fs::rename(path, &new_path) {
            Ok(_) => {
                results.push((path_str.clone(), new_path.to_string_lossy().to_string(), new_name));
            },
            Err(e) => return Err(e.to_string())
        }
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