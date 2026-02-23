import { useState } from "react";
import { ImageItem } from "../types";

export const DEFAULT_ZOOM = 180;

interface ImageGridProps {
  images: ImageItem[];
  isDragging: boolean;
  zoomWidth: number;
  setZoomWidth: (w: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClearAll: () => void;
  onRemoveSelected: () => void;
  // 🌟 接收新属性
  activeTab?: string;
  replicateCounts?: Record<string, number>;
  onUpdateCount?: (path: string, count: number) => void;
}

export default function ImageGrid({
  images, isDragging, zoomWidth, setZoomWidth, 
  onToggleSelect, onSelectAll, onDeselectAll, onClearAll, 
  activeTab, replicateCounts, onUpdateCount
}: ImageGridProps) {
  
  const [editingPath, setEditingPath] = useState<string | null>(null);

  return (
    <div className={`flex-1 flex flex-col border-2 border-dashed rounded-3xl transition-all duration-300 ease-out overflow-hidden relative ${isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.01] shadow-inner" : "border-gray-300 bg-white shadow-sm"}`}>
      {images.length > 0 && (
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-500">已加载 {images.length} 项</span>
            <div className="flex items-center gap-2 bg-gray-200/50 px-3 py-1.5 rounded-full border border-gray-200/80 shadow-inner">
              <span className="text-xs text-gray-400 opacity-80">🔍</span>
              <input type="range" min="100" max="350" step="1" value={zoomWidth} onChange={(e) => setZoomWidth(Number(e.target.value))} className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600 transition-all" />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={onSelectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">全选</button>
            <button onClick={onDeselectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            
            <div className="w-px h-5 bg-gray-200 mx-1"></div>
            <button onClick={onClearAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">一键清空</button>
          </div>
        </div>
      )}

      {images.length > 0 ? (
        <div className="w-full h-full p-6 overflow-y-auto grid gap-4 auto-rows-max content-start custom-scrollbar" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoomWidth}px, 1fr))` }}>
          {images.map((img, index) => (
            <div key={img.path} onClick={() => onToggleSelect(index)} className={`flex flex-col gap-1 group p-2 rounded-2xl transition-all duration-150 border ${img.selected ? "bg-blue-50 border-blue-500 shadow-md scale-[0.98]" : !img.isSupported ? "bg-red-50/30 border-red-100 cursor-not-allowed opacity-80" : "bg-transparent border-transparent cursor-pointer hover:border-gray-200 hover:bg-gray-50 hover:scale-[1.02]"}`}>
              {zoomWidth > 100 ? (
                <div className={`relative aspect-square rounded-xl overflow-hidden border shadow-sm flex items-center justify-center p-3 ${img.isSupported ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
                  {img.isSupported ? (
                    <img src={img.url || undefined} alt={`Preview ${index}`} className="max-w-full max-h-full object-contain border-[1.5px] border-green-400/80 rounded-sm shadow-sm transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <svg className="w-12 h-12 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  )}
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm font-mono z-10">{index + 1}</div>
                  
                  {/* 🌟 内联紫色修改器 */}
                  {activeTab === 'replicate' && img.isSupported && (
                    <div 
                      onClick={(e) => { e.stopPropagation(); setEditingPath(img.path); }}
                      className={`absolute bottom-2 right-2 text-[11px] font-bold px-2 py-1 rounded-lg shadow-lg cursor-pointer transition-all z-20 border min-w-[36px] flex justify-center items-center ${editingPath === img.path ? "bg-white text-purple-700 border-purple-500 scale-110" : "bg-purple-600 text-white border-purple-400 hover:bg-purple-700 active:scale-95"}`}
                    >
                      {editingPath === img.path ? (
                        <input
                          autoFocus type="number" min={1} defaultValue={replicateCounts?.[img.path] || 1}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => { onUpdateCount?.(img.path, Math.max(1, parseInt(e.target.value) || 1)); setEditingPath(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { onUpdateCount?.(img.path, Math.max(1, parseInt(e.currentTarget.value) || 1)); setEditingPath(null); } }}
                          className="w-6 bg-transparent outline-none text-center font-bold p-0 m-0 text-purple-700"
                        />
                      ) : ( <span>{replicateCounts?.[img.path] || 1} 张</span> )}
                    </div>
                  )}

                  {img.isSupported && (
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 ${ img.selected ? "bg-blue-500 border-blue-500" : "bg-white/90 border-gray-300" }`}>
                      {img.selected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center px-1 mb-1 mt-1">
                  <div className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${img.isSupported ? 'bg-gray-200 text-gray-600' : 'bg-red-200 text-red-700'}`}>{index + 1}</div>
                  {img.isSupported && (
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${ img.selected ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300" }`}>
                      {img.selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  )}
                </div>
              )}
              <div className={`text-xs text-center truncate px-1 font-medium ${img.isSupported ? 'text-gray-600' : 'text-red-500 font-bold'}`}>{img.name}</div>
              <div className={`text-[11px] text-center truncate px-1 font-mono tracking-tight ${img.isSupported ? 'text-blue-500/80' : 'text-red-500 font-bold'}`}>{img.size}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center pointer-events-none">
          <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <p className="text-lg text-gray-600 font-medium">将需要处理的文件拖拽至此</p>
        </div>
      )}
    </div>
  );
}