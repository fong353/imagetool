import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { ImageItem } from "./types";
import Sidebar from "./components/Sidebar";
import ImageGrid, { DEFAULT_ZOOM } from "./components/ImageGrid";
import { PAPER_CATEGORIES } from "./components/PaperSetting";
import CropSetting, { ProcessPayload } from "./components/CropSetting";
import ReplicateSetting from "./components/ReplicateSetting"; 

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);
  const [customPaper, setCustomPaper] = useState(""); 
  const [activeCraft, setActiveCraft] = useState("无"); 
  
  const [zoomWidth, setZoomWidth] = useState(DEFAULT_ZOOM);
  
  // 🌟 修复点 1：默认启动页面设为 "crop" (图像排版)
  const [activeTab, setActiveTab] = useState<"paper" | "crop" | "replicate">("crop");
  
  const [replicateCounts, setReplicateCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setIsDragging(true);
      else if (event.payload.type === "leave") setIsDragging(false);
      else if (event.payload.type === "drop") {
        setIsDragging(false);
        const filePaths = (event.payload as any).paths || [];
        if (filePaths.length === 0) return;
        
        const newImages: ImageItem[] = filePaths.map((path: string) => {
          const fileName = path.split(/[\\/]/).pop() || "未知文件";
          const isSupported = /\.(jpg|jpeg|tif|tiff|png|psd)$/i.test(path);
          return { path, url: "", name: fileName, selected: false, size: isSupported ? "解析生成中..." : "⚠️ 不支持", isSupported };
        });
        
        setImages(prev => [...prev, ...newImages]);

        newImages.forEach(async (img) => {
          if (img.isSupported) {
            try {
              const [sizeStr, thumbUrl] = await Promise.all([
                invoke<string>("get_image_size", { pathStr: img.path }),
                invoke<string>("generate_thumbnail", { pathStr: img.path })
              ]);
              const finalUrl = thumbUrl.startsWith("asset://") ? `${thumbUrl}?t=${Date.now()}` : thumbUrl;
              setImages(prev => prev.map(p => p.path === img.path ? { ...p, size: sizeStr, url: finalUrl } : p));
            } catch (error) {
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
  
  const clearAll = () => { setImages([]); setReplicateCounts({}); };
  const removeSelected = () => setImages(prev => prev.filter(img => !img.selected));

  const selectedImages = images.filter(img => img.selected && img.isSupported);

  const handleProcessAll = async (payloads: ProcessPayload[]) => {
    if (payloads.length === 0) return alert("⚠️ 提示：请先选中至少一张图片！");
    let successCount = 0;
    const processedMap = new Map<string, {newPath: string, newName: string}>();
    
    for (const payload of payloads) {
      try {
        const [newPath, newName] = await invoke<[string, string]>("process_image", {
          pathStr: payload.image.path, mode: payload.mode, targetWCm: payload.targetW, targetHCm: payload.targetH,
          cropX: payload.cropData.x, cropY: payload.cropData.y, cropW: payload.cropData.w, cropH: payload.cropData.h
        });
        successCount++;
        processedMap.set(payload.image.path, {newPath, newName});
      } catch (error) { console.error(`❌ 处理失败:`, error); }
    }

    if (successCount > 0) {
       const updatedImages = await Promise.all(images.map(async (img) => {
          const match = processedMap.get(img.path);
          if (match) {
             let newSize = img.size;
             let newThumb = img.url;
             
             try {
                newSize = await invoke<string>("get_image_size", { pathStr: match.newPath });
             } catch (e) { console.error("获取尺寸失败", e); }

             try {
                newThumb = await invoke<string>("generate_thumbnail", { pathStr: match.newPath });
                if (newThumb.startsWith("asset://")) newThumb = `${newThumb}?t=${Date.now()}`;
             } catch (e) { console.error("获取预览图失败", e); }

             return { ...img, path: match.newPath, name: match.newName, size: newSize, url: newThumb };
          }
          return img;
       }));
       setImages(updatedImages);
       //alert(`✅ 处理完成！\n成功排版 ${successCount} 张图片。`);
    } else { alert("❌ 处理失败，请查看控制台。"); }
  };

  const handleRename = async () => {
    if (selectedImages.length === 0) return;
    try {
      const finalPaperType = customPaper.trim() !== "" ? customPaper.trim() : activePaper;
      const finalPrefix = `${finalPaperType}-${activeCraft}`;
      const payload = selectedImages.map((img) => [img.path, finalPrefix]);
      const renamedData = await invoke<[string, string, string][]>("rename_files", { filesToProcess: payload });
      
      const updatedImages = await Promise.all(images.map(async (img) => {
        const match = renamedData.find(([oldPath]) => oldPath === img.path);
        if (match) {
          const [, newPath, newName] = match;
          try {
             const newSize = await invoke<string>("get_image_size", { pathStr: newPath });
             let newThumb = await invoke<string>("generate_thumbnail", { pathStr: newPath });
             if (newThumb.startsWith("asset://")) newThumb = `${newThumb}?t=${Date.now()}`;
             return { ...img, path: newPath, name: newName, url: newThumb, size: newSize, selected: false };
          } catch (e) { return { ...img, path: newPath, name: newName, selected: false }; }
        }
        return img;
      }));
      setImages(updatedImages);
    } catch (error) { alert("处理失败了：" + error); }
  };

  const handleReplicate = async () => {
    if (selectedImages.length === 0) return alert("请先选择图片！");
    let allNewPaths: string[] = [];
    try {
      for (const img of selectedImages) {
        const count = replicateCounts[img.path] || 1;
        if (count <= 1) continue;
        const res = await invoke<string[]>("replicate_image", { pathStr: img.path, totalCopies: count });
        allNewPaths.push(...res);
      }

      if (allNewPaths.length > 0) {
        const newImagesList: ImageItem[] = allNewPaths.map(path => ({
          path, url: "", name: path.split(/[\\/]/).pop() || "", selected: false, size: "解析中...", isSupported: true
        }));
        setImages(newImagesList);
        setReplicateCounts({});
        
        newImagesList.forEach(async (img) => {
          try {
            const [size, thumb] = await Promise.all([
              invoke<string>("get_image_size", { pathStr: img.path }),
              invoke<string>("generate_thumbnail", { pathStr: img.path })
            ]);
            const url = thumb.startsWith("asset://") ? `${thumb}?t=${Date.now()}` : thumb;
            setImages(prev => prev.map(p => p.path === img.path ? { ...p, size, url } : p));
          } catch(e){}
        });
        //alert(`✅ 复制成功！共生成 ${allNewPaths.length} 个文件。`);
      } else { alert("⚠️ 所有选中项份数均为 1，无需执行复制。"); }
    } catch (e) { alert("复制失败: " + e); }
  };

  return (
    <div className="flex h-screen w-screen p-5 gap-4 bg-[#f3f4f6] text-gray-800 font-sans">
      <ImageGrid 
        images={images} isDragging={isDragging} zoomWidth={zoomWidth} setZoomWidth={setZoomWidth}
        onToggleSelect={toggleSelect} onSelectAll={selectAll} onDeselectAll={deselectAll} 
        onClearAll={clearAll} onRemoveSelected={removeSelected}
        activeTab={activeTab} replicateCounts={replicateCounts}
        onUpdateCount={(path, count) => setReplicateCounts(prev => ({ ...prev, [path]: count }))}
      />
      <div className="w-72 flex flex-col gap-3 h-full shrink-0">
        <div className="flex bg-white p-1 rounded-lg shadow-sm border border-gray-100 shrink-0">
          {/* 🌟 修复点 2：更改排列顺序：图像排版 -> 纸张分配 -> 图像复制 */}
          <button onClick={() => setActiveTab("crop")} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "crop" ? "bg-gray-100 text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>裁切缩放</button>
          <button onClick={() => setActiveTab("paper")} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "paper" ? "bg-gray-100 text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-700"}`}>纸张分配</button>
          <button onClick={() => setActiveTab("replicate")} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "replicate" ? "bg-purple-100 text-purple-700 shadow-sm" : "text-purple-300 hover:text-purple-600"}`}>图像复制</button>
        </div>
        
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "crop" && (
            <CropSetting selectedImages={selectedImages} onProcessAll={handleProcessAll} />
          )}
          {activeTab === "paper" && (
            <Sidebar activePaper={activePaper} setActivePaper={setActivePaper} customPaper={customPaper} setCustomPaper={setCustomPaper} activeCraft={activeCraft} setActiveCraft={setActiveCraft} selectedImages={selectedImages} onExecuteRename={handleRename} />
          )}
          {activeTab === "replicate" && (
            <ReplicateSetting selectedCount={selectedImages.length} onExecute={handleReplicate} />
          )}
        </div>
      </div>
    </div>
  );
}