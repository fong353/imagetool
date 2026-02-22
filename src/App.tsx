import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { ImageItem } from "./types";
import Sidebar from "./components/Sidebar";
import ImageGrid, { DEFAULT_ZOOM } from "./components/ImageGrid";
// 确保你已经从 PaperSetting 导出了 CRAFT_CATEGORIES (如果没有导出，把下方的 CRAFT_CATEGORIES[2] 改为 "无" 即可)
import { PAPER_CATEGORIES, CRAFT_CATEGORIES } from "./components/PaperSetting";
import CropSetting, { ProcessPayload } from "./components/CropSetting";

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // ==========================================
  // 🌟 纸张与工艺分配相关的状态
  // ==========================================
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);
  const [customPaper, setCustomPaper] = useState(""); 
  const [activeCraft, setActiveCraft] = useState("无"); // 默认工艺为“无”
  
  // 视图控制
  const [zoomWidth, setZoomWidth] = useState(DEFAULT_ZOOM);
  const [activeTab, setActiveTab] = useState<"paper" | "crop">("crop");

  // ==========================================
  // 🌟 监听文件拖入事件 & 智能探针读取
  // ==========================================
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setIsDragging(true);
      else if (event.payload.type === "leave") setIsDragging(false);
      else if (event.payload.type === "drop") {
        setIsDragging(false);
        const filePaths = (event.payload as any).paths || [];
        if (filePaths.length === 0) return;
        
        const newImages: ImageItem[] = filePaths.map((path: string) => {
          const fileName = path.split(/[\\/]/).pop() || "未知文件"; // 兼容 Win/Mac 路径切割
          const isSupported = /\.(jpg|jpeg|tif|tiff|png|webp|psd)$/i.test(path);
          return {
            path, 
            url: "", 
            name: fileName,
            selected: false, 
            size: isSupported ? "解析生成中..." : "⚠️ 不支持",
            isSupported
          };
        });
        
        setImages(prev => [...prev, ...newImages]);

        newImages.forEach(async (img) => {
          if (img.isSupported) {
            try {
              const [sizeStr, thumbUrl] = await Promise.all([
                invoke<string>("get_image_size", { pathStr: img.path }),
                invoke<string>("generate_thumbnail", { pathStr: img.path })
              ]);
              // 加上时间戳，防止本地协议图片被浏览器死缓存
              const finalUrl = thumbUrl.startsWith("asset://") ? `${thumbUrl}?t=${Date.now()}` : thumbUrl;
              setImages(prev => prev.map(p => 
                p.path === img.path ? { ...p, size: sizeStr, url: finalUrl } : p
              ));
            } catch (error) {
              console.error(`解析 ${img.name} 失败:`, error);
              setImages(prev => prev.map(p => 
                p.path === img.path ? { ...p, size: "尺寸未知" } : p
              ));
            }
          }
        });
      }
    });
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, []);

  const toggleSelect = (index: number) => setImages(prev => prev.map((img, i) => (i === index && img.isSupported) ? { ...img, selected: !img.selected } : img));
  const selectAll = () => setImages(prev => prev.map(img => img.isSupported ? { ...img, selected: true } : img));
  const deselectAll = () => setImages(prev => prev.map(img => ({ ...img, selected: false })));
  const clearAll = () => setImages([]);
  const removeSelected = () => setImages(prev => prev.filter(img => !img.selected));

  const selectedImages = images.filter(img => img.selected && img.isSupported);

  // ==========================================
  // 🌟 核心引擎：图像排版批量执行
  // ==========================================
  // ==========================================
  // 🌟 核心引擎：图像排版批量执行 (同步更新新指纹)
  // ==========================================
  const handleProcessAll = async (payloads: ProcessPayload[]) => {
    if (payloads.length === 0) {
      alert("⚠️ 提示：请先在左侧网格中【点击选中】至少一张图片，然后再点击执行！");
      return; 
    }
    
    let successCount = 0;
    // 记录：旧路径 -> { 新路径, 新名字 }
    const processedMap = new Map<string, {newPath: string, newName: string}>();
    
    for (const payload of payloads) {
      try {
        // 🌟 注意：这里现在接收 Rust 返回的新路径和新名字数组
        const [newPath, newName] = await invoke<[string, string]>("process_image", {
          pathStr: payload.image.path, 
          mode: payload.mode, 
          targetWCm: payload.targetW, 
          targetHCm: payload.targetH,
          cropX: payload.cropData.x, 
          cropY: payload.cropData.y, 
          cropW: payload.cropData.w, 
          cropH: payload.cropData.h
        });
        successCount++;
        processedMap.set(payload.image.path, {newPath, newName});
      } catch (error) {
        console.error(`❌ 处理 ${payload.image.name} 失败:`, error);
      }
    }

    if (successCount > 0) {
       // 重新去本地硬盘请求最新的尺寸和画面，并更新可能发生变动的指纹名字！
       const updatedImages = await Promise.all(images.map(async (img) => {
          const match = processedMap.get(img.path);
          if (match) {
             try {
                // 用新的路径去请求尺寸和缩略图
                const newSize = await invoke<string>("get_image_size", { pathStr: match.newPath });
                let newThumb = await invoke<string>("generate_thumbnail", { pathStr: match.newPath });
                if (newThumb.startsWith("asset://")) newThumb = `${newThumb}?t=${Date.now()}`;
                
                // 🌟 同步更新 path 和 name
                return { ...img, path: match.newPath, name: match.newName, size: newSize, url: newThumb };
             } catch (e) {
                return { ...img, path: match.newPath, name: match.newName };
             }
          }
          return img;
       }));
       setImages(updatedImages);
       
       alert(`✅ 处理完成！\n成功排版 ${successCount} 张图片，并已更新防伪指纹。`);
    } else {
       alert("❌ 处理失败，请查看控制台。");
    }
  };

  // ==========================================
  // 🌟 核心引擎：纸张分配 (重命名与指纹注入)
  // ==========================================
  const handleRename = async () => {
    if (selectedImages.length === 0) return;
    try {
      const finalPaperType = customPaper.trim() !== "" ? customPaper.trim() : activePaper;
      
      // 🚀 核心拼接逻辑：在这里把“材质”和“工艺”用横杠连起来，再发给 Rust！
      // 例如拼出: "210蚀刻-做框" 或 "水彩纸-无"
      const finalPrefix = `${finalPaperType}-${activeCraft}`;
      
      const payload = selectedImages.map((img) => [img.path, finalPrefix]);
      
      const renamedData = await invoke<[string, string, string][]>("rename_files", { filesToProcess: payload });
      
      // 用新路径去请求缩略图和尺寸
      const updatedImages = await Promise.all(images.map(async (img) => {
        const match = renamedData.find(([oldPath]) => oldPath === img.path);
        if (match) {
          const [, newPath, newName] = match;
          try {
             const newSize = await invoke<string>("get_image_size", { pathStr: newPath });
             let newThumb = await invoke<string>("generate_thumbnail", { pathStr: newPath });
             if (newThumb.startsWith("asset://")) newThumb = `${newThumb}?t=${Date.now()}`;
             return { ...img, path: newPath, name: newName, url: newThumb, size: newSize, selected: false };
          } catch (e) {
             return { ...img, path: newPath, name: newName, selected: false };
          }
        }
        return img;
      }));
      
      setImages(updatedImages);
    } catch (error) {
      alert("处理失败了：" + error);
    }
  };

  return (
    <div className="flex h-screen w-screen p-5 gap-4 bg-[#f3f4f6] text-gray-800 font-sans">
      <ImageGrid 
        images={images} isDragging={isDragging} zoomWidth={zoomWidth} setZoomWidth={setZoomWidth}
        onToggleSelect={toggleSelect} onSelectAll={selectAll} onDeselectAll={deselectAll} 
        onClearAll={clearAll} onRemoveSelected={removeSelected}
      />
      <div className="w-72 flex flex-col gap-3 h-full shrink-0">
        <div className="flex bg-white p-1 rounded-lg shadow-sm border border-gray-100 shrink-0">
          <button onClick={() => setActiveTab("paper")} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "paper" ? "bg-gray-100 text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>纸张分配</button>
          <button onClick={() => setActiveTab("crop")} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "crop" ? "bg-gray-100 text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>图像排版</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "paper" ? (
            <Sidebar 
              activePaper={activePaper} 
              setActivePaper={setActivePaper} 
              customPaper={customPaper} 
              setCustomPaper={setCustomPaper} 
              // 🌟 传入新增的工艺状态
              activeCraft={activeCraft}
              setActiveCraft={setActiveCraft}
              selectedImages={selectedImages} 
              onExecuteRename={handleRename} 
            />
          ) : (
            <CropSetting selectedImages={selectedImages} onProcessAll={handleProcessAll} />
          )}
        </div>
      </div>
    </div>
  );
}