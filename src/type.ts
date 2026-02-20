import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { ImageItem, ProcessMode } from "./types";
import Sidebar from "./components/Sidebar";
import ImageGrid, { DEFAULT_ZOOM } from "./components/ImageGrid";
import { PAPER_CATEGORIES } from "./components/PaperSetting";
import CropSetting from "./components/CropSetting";

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);
  const [customPaper, setCustomPaper] = useState(""); 
  const [zoomWidth, setZoomWidth] = useState(DEFAULT_ZOOM);

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
            path, url: convertFileSrc(path), name: fileName,
            selected: false, size: isSupported ? "解析标头中..." : "⚠️ 不支持的文件",
            isSupported
          };
        });
        
        setImages(prev => [...prev, ...newImages]);

        newImages.forEach(async (img) => {
          if (img.isSupported) {
            try {
              const sizeStr = await invoke<string>("get_image_size", { pathStr: img.path });
              setImages(prev => prev.map(p => p.path === img.path ? { ...p, size: sizeStr } : p));
            } catch {
              setImages(prev => prev.map(p => p.path === img.path ? { ...p, size: "尺寸未知" } : p));
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
  const selectedForCrop = selectedImages.length === 1 ? selectedImages[0] : undefined;

  const handleProcess = async (mode: ProcessMode, targetW: number, targetH: number, cropData: {x: number, y: number, w: number, h: number}) => {
    if (!selectedForCrop) return;
    try {
      const newPath = await invoke<string>("process_image", {
        pathStr: selectedForCrop.path,
        mode: mode,
        targetWCm: targetW,
        targetHCm: targetH,
        cropX: cropData.x,
        cropY: cropData.y,
        cropW: cropData.w,
        cropH: cropData.h
      });
      
      alert(`处理成功！文件已保存至:\n${newPath}\n(物理DPI护甲已注入)`);
      deselectAll();
    } catch (error) {
      alert("处理失败：" + error);
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
    <div className="flex h-screen w-screen p-6 gap-6 bg-[#f3f4f6] text-gray-800 font-sans">
      <ImageGrid 
        images={images} isDragging={isDragging} zoomWidth={zoomWidth} setZoomWidth={setZoomWidth}
        onToggleSelect={toggleSelect} onSelectAll={selectAll} onDeselectAll={deselectAll} 
        onClearAll={clearAll} onRemoveSelected={removeSelected}
      />
      <div className="w-80 flex flex-col gap-6">
        <Sidebar 
          activePaper={activePaper} setActivePaper={setActivePaper} customPaper={customPaper} setCustomPaper={setCustomPaper}
          selectedImages={selectedImages} onExecuteRename={handleRename}
        />
        <CropSetting selectedImage={selectedForCrop} onProcess={handleProcess} />
      </div>
    </div>
  );
}