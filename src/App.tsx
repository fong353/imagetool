import { useState, useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const PAPER_CATEGORIES = ["210蚀刻", "315蚀刻", "水彩纸", "硫化钡", "博物馆蚀刻"];

function App() {
  const [images, setImages] = useState<{ url: string; path: string; name: string; selected: boolean }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activePaper, setActivePaper] = useState(PAPER_CATEGORIES[0]);

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") setIsDragging(true);
      else if (event.payload.type === "leave") setIsDragging(false);
      else if (event.payload.type === "drop") {
        setIsDragging(false);
        const filePaths = event.payload.paths;
        const imagePaths = filePaths.filter((path) => /\.(jpg|jpeg|png|webp|gif|tif|tiff|bmp)$/i.test(path));

        if (imagePaths.length > 0) {
          const newImages = imagePaths.map((path) => {
            const fileName = path.split("/").pop() || "未知文件";
            return {
              path: path,
              url: convertFileSrc(path),
              name: fileName,
              selected: false 
            };
          });
          setImages(prev => [...prev, ...newImages]);
        }
      }
    });
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, []);

  const toggleSelect = (index: number) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, selected: !img.selected } : img));
  };

  const selectAll = () => setImages(prev => prev.map(img => ({ ...img, selected: true })));
  const deselectAll = () => setImages(prev => prev.map(img => ({ ...img, selected: false })));

  const selectedImages = images.filter(img => img.selected);

  // 🚀 核心逻辑升级：原地刷新数据
  const handleRename = async () => {
    if (selectedImages.length === 0) return;
    try {
      const payload = selectedImages.map((img) => [img.path, activePaper]);
      
      // 等待 Rust 汇报战果。它会返回一个数组：[[旧路径, 新路径, 新名字], ...]
      const renamedData = await invoke<[string, string, string][]>("rename_files", { filesToProcess: payload });
      
      // 用新数据替换掉界面上的旧数据
      setImages(prev => prev.map(img => {
        // 去汇报清单里找找，当前这张图有没有被改名
        const match = renamedData.find(([oldPath]) => oldPath === img.path);
        
        if (match) {
          const [, newPath, newName] = match; // 解构出新路径和新名字
          return {
            ...img,
            path: newPath,             // 💡 极其重要：更新底层物理路径
            name: newName,             // 💡 更新显示的文字
            url: convertFileSrc(newPath), // 💡 重新生成安全预览链接
            selected: false            // 💡 改名成功后，自动帮用户取消勾选
          };
        }
        return img; // 没参与这次改名的图片保持原样
      }));
      
    } catch (error) {
      alert("重命名失败了：" + error);
    }
  };

  return (
    <div className="flex h-screen w-screen p-6 gap-6 bg-[#f3f4f6] text-gray-800 font-sans">
      
      {/* 左侧区域：保持不变 */}
      <div className={`flex-1 flex flex-col border-2 border-dashed rounded-3xl transition-all duration-300 ease-out overflow-hidden relative ${
          isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.01] shadow-inner" : "border-gray-300 bg-white shadow-sm"
        }`}>
        
        {images.length > 0 && (
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <span className="text-sm font-medium text-gray-500">已加载 {images.length} 张图片</span>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">全选</button>
              <button onClick={deselectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">取消全选</button>
            </div>
          </div>
        )}

        {images.length > 0 ? (
          <div className="w-full h-full p-6 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 auto-rows-max content-start custom-scrollbar">
            {images.map((img, index) => (
              <div 
                key={img.path} // 路径变了，React会自然刷新这个组件
                onClick={() => toggleSelect(index)}
                className={`flex flex-col gap-2 group cursor-pointer p-2 rounded-2xl transition-all duration-200 ${
                  img.selected ? "bg-blue-50 ring-2 ring-blue-500 shadow-md" : "bg-transparent hover:bg-gray-50"
                }`}
              >
                <div className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
                  <img src={img.url} alt={`Preview ${index}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm font-mono">{index + 1}</div>
                  
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    img.selected ? "bg-blue-500 border-blue-500" : "bg-white/90 border-gray-300"
                  }`}>
                    {img.selected && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                
                {/* 💡 这里显示的文字，会在改名后瞬间更新 */}
                <div className="text-xs text-gray-500 text-center truncate px-1 font-medium">
                  {img.name}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center pointer-events-none">
             {/* 占位图标省略... */}
             <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg text-gray-600 font-medium">将图片拖拽至此</p>
            <p className="mt-2 text-sm text-gray-400">随后在画面中勾选需要处理的文件</p>
          </div>
        )}
      </div>

      {/* 右侧面板 */}
      <div className="w-72 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">应用纸张类目</h2>
          <p className="text-sm text-gray-500 mt-1 mb-6">为左侧<span className="text-blue-600 font-bold">已勾选</span>的图片指定纸张。</p>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar grid grid-cols-2 gap-3 content-start">
          {PAPER_CATEGORIES.map((cat) => (
            <button 
              key={cat}
              onClick={() => setActivePaper(cat)}
              className={`flex items-center justify-center p-3 rounded-xl border-2 transition-all text-sm font-medium active:scale-95 ${
                activePaper === cat 
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 💡 文字改回“应用重命名” */}
        <button 
          onClick={handleRename} 
          disabled={selectedImages.length === 0} 
          className="w-full mt-6 py-4 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <span>应用重命名</span>
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