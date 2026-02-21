import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { ImageItem } from "./types";
import Sidebar from "./components/Sidebar";
import ImageGrid, { DEFAULT_ZOOM } from "./components/ImageGrid";
import { PAPER_CATEGORIES } from "./components/PaperSetting";
import CropSetting, { ProcessPayload } from "./components/CropSetting";

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // 纸张分配相关的状态
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);
  const [customPaper, setCustomPaper] = useState(""); 
  
  // 视图控制
  const [zoomWidth, setZoomWidth] = useState(DEFAULT_ZOOM);
  const [activeTab, setActiveTab] = useState<"paper" | "crop">("crop");

  // 🌟 监听文件拖入事件
  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setIsDragging(true);
      else if (event.payload.type === "leave") setIsDragging(false);
      else if (event.payload.type === "drop") {
        setIsDragging(false);
        const filePaths = (event.payload as any).paths || [];
        if (filePaths.length === 0) return;
        
        const newImages: ImageItem[] = filePaths.map((path: string) => {
          const fileName = path.split("/").pop() || "未知文件";
          const isSupported = /\.(jpg|jpeg|tif|tiff)$/i.test(path);
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
              const [sizeStr, thumbBase64] = await Promise.all([
                invoke<string>("get_image_size", { pathStr: img.path }),
                invoke<string>("generate_thumbnail", { pathStr: img.path })
              ]);
              setImages(prev => prev.map(p => 
                p.path === img.path ? { ...p, size: sizeStr, url: thumbBase64 } : p
              ));
            } catch (error) {
              console.error(`解析 ${img.name} 失败，使用兜底路径:`, error);
              setImages(prev => prev.map(p => 
                p.path === img.path ? { ...p, size: "尺寸未知", url: convertFileSrc(img.path) } : p
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

  // ====== 🌟 核心引擎：一键批量执行 (已加装雷达监控) ======
  const handleProcessAll = async (payloads: ProcessPayload[]) => {
    console.log("🚀 [大管家雷达] 1. 成功收到面板传来的打包指令！", payloads);

    if (payloads.length === 0) {
      alert("⚠️ 提示：请先在左侧网格中【点击选中】至少一张图片，然后再点击执行！");
      return; 
    }
    
    let successCount = 0;
    
    for (const payload of payloads) {
      console.log(`🚀 [大管家雷达] 2. 正在呼叫 Rust 引擎处理图片: ${payload.image.name}...`);
      try {
        const res = await invoke("process_image", {
          pathStr: payload.image.path, 
          mode: payload.mode, 
          targetWCm: payload.targetW, 
          targetHCm: payload.targetH,
          cropX: payload.cropData.x, 
          cropY: payload.cropData.y, 
          cropW: payload.cropData.w, 
          cropH: payload.cropData.h
        });
        console.log(`✅ [Rust 返回] 3. ${payload.image.name} 处理成功！成图路径:`, res);
        successCount++;
      } catch (error) {
        console.error(`❌ [Rust 崩溃] 处理 ${payload.image.name} 时底层报错:`, error);
      }
    }

    console.log("🚀 [大管家雷达] 4. 任务流结束，成功数量:", successCount);
    if (successCount > 0) {
       alert(`✅ 处理完成！\n成功执行了 ${successCount} 张图片并已注入 300 DPI 护甲。`);
    } else {
       alert("❌ 处理失败，请查看控制台的红色报错。");
    }
  };

  const handleRename = async () => {
    if (selectedImages.length === 0) return;
    try {
      const finalPaperType = customPaper.trim() !== "" ? customPaper.trim() : activePaper;
      const payload = selectedImages.map((img) => [img.path, finalPaperType]);
      const renamedData = await invoke<[string, string, string][]>("rename_files", { filesToProcess: payload });
      
      setImages(prev => prev.map(img => {
        const match = renamedData.find(([oldPath]) => oldPath === img.path);
        if (match) {
          const [, newPath, newName] = match;
          return { ...img, path: newPath, name: newName, url: convertFileSrc(newPath), selected: false };
        }
        return img;
      }));
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
            <Sidebar activePaper={activePaper} setActivePaper={setActivePaper} customPaper={customPaper} setCustomPaper={setCustomPaper} selectedImages={selectedImages} onExecuteRename={handleRename} />
          ) : (
            <CropSetting selectedImages={selectedImages} onProcessAll={handleProcessAll} />
          )}
        </div>
      </div>
    </div>
  );
}