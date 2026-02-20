import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const PAPER_CATEGORIES = [
  "210蚀刻", "315蚀刻", "水彩纸", "硫化钡", "博物馆蚀刻",
  "光泽相纸", "绒面相纸", "亚光相纸", "粗面水彩", "纯棉平滑",
  "金属相纸", "宣纸", "油画布", "灯箱片", "背胶PP"
];

function App() {
  const [images, setImages] = useState<{ url: string; path: string; name: string; selected: boolean; size: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);
  const [customPaper, setCustomPaper] = useState(""); 

  const DEFAULT_ZOOM = 180;
  const [zoomWidth, setZoomWidth] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setIsDragging(true);
      else if (event.payload.type === "leave") setIsDragging(false);
      else if (event.payload.type === "drop") {
        setIsDragging(false);
        const filePaths = event.payload.paths as string[];
        
        // 过滤支持的文件
        const imagePaths = filePaths.filter((path) => /\.(jpg|jpeg|tif|tiff)$/i.test(path));

        // 💡 增加功能 2：如果有不支持的文件被拖入，直接弹窗报警
        if (filePaths.length > imagePaths.length) {
          alert("⚠️ 格式报警！\n\n为了保证排版数据的绝对安全，本软件仅支持载入 JPG 和 TIF 格式的图片。\n已自动为您拦截并忽略不支持的文件。");
        }

        if (imagePaths.length > 0) {
          const newImages = imagePaths.map((path) => {
            const fileName = path.split("/").pop() || "未知文件";
            return {
              path: path,
              url: convertFileSrc(path),
              name: fileName,
              selected: false,
              size: "解析标头中..."
            };
          });
          
          setImages(prev => [...prev, ...newImages]);

          newImages.forEach(async (img) => {
            try {
              const sizeStr = await invoke<string>("get_image_size", { pathStr: img.path });
              setImages(prev => prev.map(p => p.path === img.path ? { ...p, size: sizeStr } : p));
            } catch (error) {
              setImages(prev => prev.map(p => p.path === img.path ? { ...p, size: "尺寸未知" } : p));
            }
          });
        }
      }
    });
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, []);

  const toggleSelect = (index: number) => setImages(prev => prev.map((img, i) => i === index ? { ...img, selected: !img.selected } : img));
  const selectAll = () => setImages(prev => prev.map(img => ({ ...img, selected: true })));
  const deselectAll = () => setImages(prev => prev.map(img => ({ ...img, selected: false })));
  const clearAll = () => setImages([]);
  
  // 💡 增加功能 3：移除选中文件的逻辑
  const removeSelected = () => setImages(prev => prev.filter(img => !img.selected));

  const selectedImages = images.filter(img => img.selected);

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
          return {
            ...img,
            path: newPath,
            name: newName,
            url: convertFileSrc(newPath),
            selected: false 
          };
        }
        return img;
      }));
    } catch (error) {
      alert("处理失败了：" + error);
    }
  };

  return (
    <div className="flex h-screen w-screen p-6 gap-6 bg-[#f3f4f6] text-gray-800 font-sans">
      
      {/* 左侧区域 */}
      <div className={`flex-1 flex flex-col border-2 border-dashed rounded-3xl transition-all duration-300 ease-out overflow-hidden relative ${
          isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.01] shadow-inner" : "border-gray-300 bg-white shadow-sm"
        }`}>
        
        {images.length > 0 && (
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-500">已加载 {images.length} 张</span>
              
              <div className="flex items-center gap-2 bg-gray-200/50 px-3 py-1.5 rounded-full border border-gray-200/80 shadow-inner">
                <span className="text-xs text-gray-400 opacity-80">🔍</span>
                <input 
                  type="range" 
                  min="100" 
                  max="350" 
                  step="1"
                  value={zoomWidth} 
                  onChange={(e) => setZoomWidth(Number(e.target.value))}
                  className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600 transition-all"
                />
                {zoomWidth !== DEFAULT_ZOOM && (
                  <button onClick={() => setZoomWidth(DEFAULT_ZOOM)} className="text-[10px] font-medium text-gray-400 hover:text-blue-500 active:scale-90 transition-all" title="复位缩放">
                    REST
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <button onClick={selectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">全选</button>
              <button onClick={deselectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
              
              {/* 💡 增加功能 3：优雅的移除选中文件 Icon 按钮 */}
              <button 
                onClick={removeSelected} 
                disabled={selectedImages.length === 0}
                title="移除选中的图片"
                className={`flex items-center justify-center p-1.5 rounded-lg border transition-colors ${
                  selectedImages.length > 0 
                  ? "border-orange-200 text-orange-500 hover:bg-orange-50 bg-white shadow-sm" 
                  : "border-gray-200 text-gray-300 bg-gray-50/50 cursor-not-allowed"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>

              {/* 视觉分割线 */}
              <div className="w-px h-5 bg-gray-200 mx-1"></div>

              <button onClick={clearAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors">一键清空</button>
            </div>
          </div>
        )}

        {images.length > 0 ? (
          <div 
            className="w-full h-full p-6 overflow-y-auto grid gap-4 auto-rows-max content-start custom-scrollbar"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoomWidth}px, 1fr))` }}
          >
            {images.map((img, index) => (
              <div key={img.path} onClick={() => toggleSelect(index)} className={`flex flex-col gap-1 group cursor-pointer p-2 rounded-2xl transition-all duration-150 border border-transparent ${ img.selected ? "bg-blue-50 ring-2 ring-blue-500 shadow-md scale-[0.98]" : "bg-transparent hover:border-gray-200 hover:bg-gray-50 hover:scale-[1.02]" }`}>
                
                {/* 💡 增加功能 1：判断 zoomWidth，如果等于 100（拉到最小），则隐藏图片缩略图，呈现极简列表风格 */}
                {zoomWidth > 100 ? (
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50 mb-1">
                    <img src={img.url} alt={`Preview ${index}`} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm font-mono">{index + 1}</div>
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${ img.selected ? "bg-blue-500 border-blue-500" : "bg-white/90 border-gray-300" }`}>
                      {img.selected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                ) : (
                  // 极简数据视图的小表头（仅包含序号和勾选框）
                  <div className="flex justify-between items-center px-1 mb-1 mt-1">
                    <div className="bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-md font-mono">{index + 1}</div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${ img.selected ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300" }`}>
                      {img.selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-600 text-center truncate px-1 font-medium">{img.name}</div>
                <div className="text-[11px] text-blue-500/80 text-center truncate px-1 font-mono tracking-tight">{img.size}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center pointer-events-none">
             <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg text-gray-600 font-medium">将需要处理的文件拖拽至此</p>
            <p className="mt-2 text-sm text-gray-400">仅支持 JPG 和 TIF 格式</p>
          </div>
        )}
      </div>

      {/* 右侧面板 */}
      <div className="w-[340px] bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col shrink-0">
        
        <div className="flex flex-col flex-1 min-h-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800 tracking-tight">纸张类目分配</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">应用后将自动命名为 <br/><span className="font-mono text-gray-700 bg-gray-100 px-1 py-0.5 rounded">类目-序号.后缀</span></p>
          </div>

          <div className="overflow-y-auto pr-1 custom-scrollbar grid grid-cols-3 gap-2 content-start mb-4">
            {PAPER_CATEGORIES.map((cat) => (
              <button 
                key={cat} 
                onClick={() => {
                  setActivePaper(cat);
                  setCustomPaper(""); 
                }} 
                className={`flex items-center justify-center py-2 px-1 rounded-lg border-2 transition-all text-[13px] font-medium active:scale-95 ${ 
                  activePaper === cat && customPaper === ""
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" 
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-white" 
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-gray-100 pt-4">
            <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">或手动输入材质名称</h3>
            <input 
              type="text" 
              placeholder="例如：日本和纸" 
              value={customPaper}
              onChange={(e) => setCustomPaper(e.target.value)}
              className={`w-full bg-gray-50 border-2 rounded-xl py-2 px-3 text-sm focus:bg-white outline-none transition-all ${
                customPaper.trim() !== "" ? "border-blue-500 ring-2 ring-blue-100 bg-white" : "border-gray-200 focus:border-blue-400"
              }`}
            />
          </div>
        </div>

        <button 
          onClick={handleRename} 
          disabled={selectedImages.length === 0} 
          className="w-full mt-6 py-4 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <span>执行修改与命名</span>
          {selectedImages.length > 0 && (
            <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-mono">
              {selectedImages.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default App;