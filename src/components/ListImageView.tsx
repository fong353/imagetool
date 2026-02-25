import { useState } from "react";
import { ImageItem } from "../types";

interface ListImageViewProps {
  images: ImageItem[];
  onToggleSelect: (index: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onClearAll?: () => void;
  costQuantities?: Record<string, number>;
  onUpdateCostQuantity?: (path: string, quantity: number) => void;
  onRemoveOne?: (path: string) => void;
}

export default function ListImageView({
  images, onToggleSelect, onSelectAll, onDeselectAll, onClearAll, costQuantities, onUpdateCostQuantity, onRemoveOne
}: ListImageViewProps) {
  const [listZoom, setListZoom] = useState(100);

  const scale = listZoom / 100;
  const columnTemplate = "40px 60px 250px 80px 120px 100px 60px";
  const thumbSize = Math.max(28, Math.round(48 * scale));
  const rowPaddingY = Math.max(8, Math.round(12 * scale));

  const calcAreaFromSize = (size?: string): number | null => {
    if (!size || !size.includes("x")) return null;
    const match = size.match(/([\d.]+)\s*x\s*([\d.]+)/);
    if (!match) return null;
    const w_cm = parseFloat(match[1]);
    const h_cm = parseFloat(match[2]);
    if (!Number.isFinite(w_cm) || !Number.isFinite(h_cm)) return null;
    return (w_cm / 100) * (h_cm / 100);
  };

  const totalArea = images.reduce((sum, img) => {
    const baseArea = calcAreaFromSize(img.size);
    if (baseArea === null) return sum;
    const qty = Math.max(1, costQuantities?.[img.path] || 1);
    return sum + baseArea * qty;
  }, 0);

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
        <span className="text-sm font-medium text-gray-600">成本核算 - {images.length} 项图片 · 总面积 {totalArea.toFixed(4)} ㎡</span>
        {images.length > 0 && (
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-gray-200/50 px-3 py-1.5 rounded-full border border-gray-200/80 shadow-inner">
              <span className="text-xs text-gray-400 opacity-80">🔍</span>
              <input
                type="range"
                min="80"
                max="250"
                step="1"
                value={listZoom}
                onChange={(e) => setListZoom(Number(e.target.value))}
                className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600 transition-all"
              />
              <span className="text-[11px] text-gray-500 w-9 text-right">{listZoom}%</span>
            </div>
            <button onClick={onSelectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors">全选</button>
            <button onClick={onDeselectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">取消</button>
            <div className="w-px h-5 bg-gray-200"></div>
            <button onClick={onClearAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">一键清空</button>
          </div>
        )}
      </div>
      
      <div className="w-full overflow-y-auto custom-scrollbar">
        {/* 表头 */}
        <div className="sticky top-0 z-10 grid px-6 py-3 bg-gray-100/80 backdrop-blur-sm border-b border-gray-200 text-xs font-bold text-gray-600" style={{ gridTemplateColumns: columnTemplate, columnGap: "20px" }}>
          <div className="text-center">#</div>
          <div className="text-center">缩略图</div>
          <div>文件名</div>
          <div className="text-center">数量</div>
          <div className="text-center">物理尺寸</div>
          <div className="text-center">面积 (㎡)</div>
          <div className="text-center">操作</div>
        </div>
        
        {/* 数据行 */}
        <div className="divide-y divide-gray-100">
          {images.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">暂无图片</div>
          ) : (
            <>
              {images.map((img, index) => {
                const qty = Math.max(1, costQuantities?.[img.path] || 1);
                const baseArea = calcAreaFromSize(img.size);
                const areaM2 = baseArea === null ? "--" : (baseArea * qty).toFixed(4);
                
                return (
                  <div
                    key={img.path}
                    onClick={() => onToggleSelect(index)}
                    className={`grid px-6 items-center transition-all cursor-pointer ${
                      img.selected
                        ? "bg-blue-50 border-l-4 border-l-blue-500"
                        : !img.isSupported
                        ? "bg-red-50/30 opacity-60 cursor-not-allowed"
                        : "hover:bg-gray-50"
                    }`}
                    style={{ gridTemplateColumns: columnTemplate, columnGap: "20px", paddingTop: `${rowPaddingY}px`, paddingBottom: `${rowPaddingY}px` }}
                  >
                    <div className="text-xs font-bold text-gray-500 text-center">{index + 1}</div>

                    <div className="flex items-center justify-center">
                      {img.url && (
                        <img src={img.url} alt={img.name} className="rounded-md object-contain" style={{ width: `${thumbSize}px`, height: `${thumbSize}px` }} />
                      )}
                    </div>
                    
                    <div className={`text-sm truncate font-medium ${img.isSupported ? "text-gray-700" : "text-red-600 font-bold"}`}>
                      {img.name}
                    </div>
                    
                    <input
                      type="number"
                      min="1"
                      value={costQuantities?.[img.path] || 1}
                      onChange={(e) => {
                        e.stopPropagation();
                        const qty = Math.max(1, parseInt(e.currentTarget.value) || 1);
                        onUpdateCostQuantity?.(img.path, qty);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 text-xs font-bold text-center border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:bg-orange-50"
                    />
                    
                    <div className={`text-xs text-center font-mono ${img.isSupported ? "text-blue-600" : "text-red-500 font-bold"}`}>
                      {img.size}
                    </div>
                    
                    <div className="text-xs text-center text-gray-600 font-mono">{areaM2}</div>
                    
                    <div className="flex items-center justify-center">
                      {img.isSupported && (
                        <button onClick={(e) => { e.stopPropagation(); onRemoveOne?.(img.path); }} className="text-xs text-red-600 bg-white px-1.5 py-0.5 rounded-md border border-red-100 hover:bg-red-50">移除</button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div
                className="grid px-6 py-3 items-center bg-gray-50 border-t border-gray-200"
                style={{ gridTemplateColumns: columnTemplate, columnGap: "20px" }}
              >
                <div></div>
                <div></div>
                <div className="text-sm font-semibold text-gray-700">合计</div>
                <div></div>
                <div></div>
                <div></div>
                <div className="text-xs text-center font-mono font-bold text-blue-700">{totalArea.toFixed(4)}</div>
                <div className="text-[11px] text-center text-gray-500">㎡</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
