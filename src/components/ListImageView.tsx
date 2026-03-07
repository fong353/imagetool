import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { ImageItem } from "../types";

interface ListImageViewProps {
  images: ImageItem[];
  disabled?: boolean;
  onToggleSelect: (index: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onClearAll?: () => void;
  costQuantities?: Record<string, number>;
  onUpdateCostQuantity?: (path: string, quantity: number) => void;
  costUnitPrices?: Record<string, number>;
  onUpdateCostUnitPrice?: (path: string, price: number) => void;
  costRemarks?: Record<string, string>;
  onUpdateCostRemark?: (path: string, text: string) => void;
  onRemoveOne?: (path: string) => void;
}

export default function ListImageView({
  images, disabled, onToggleSelect, onSelectAll, onDeselectAll, onClearAll, costQuantities, onUpdateCostQuantity, costUnitPrices, onUpdateCostUnitPrice, costRemarks, onUpdateCostRemark, onRemoveOne
}: ListImageViewProps) {
  const [listZoom, setListZoom] = useState(100);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const calcAreaFromSize = (size?: string): number | null => {
    if (!size || !size.includes("x")) return null;
    const match = size.match(/([\d.]+)\s*x\s*([\d.]+)/);
    if (!match) return null;
    const w_cm = parseFloat(match[1]);
    const h_cm = parseFloat(match[2]);
    if (!Number.isFinite(w_cm) || !Number.isFinite(h_cm)) return null;
    return (w_cm / 100) * (h_cm / 100);
  };

  const handleExportHtml = async () => {
    const supported = images.filter((img) => img.isSupported);
    if (isExporting || supported.length === 0) return;
    setIsExporting(true);
    setExportMsg(null);
    try {
      const thumbBase64: Record<string, string> = {};
      for (const img of supported) {
        try {
          thumbBase64[img.path] = await invoke<string>("get_thumbnail_base64", { pathStr: img.path });
        } catch {
          thumbBase64[img.path] = "";
        }
      }

      const grandTotalArea = images.reduce((sum, img) => {
        const baseArea = calcAreaFromSize(img.size);
        if (baseArea === null || !img.isSupported) return sum;
        const qty = Math.max(1, costQuantities?.[img.path] || 1);
        return sum + baseArea * qty;
      }, 0);
      const grandTotalAmount = images.reduce((sum, img) => {
        if (!img.isSupported) return sum;
        const baseArea = calcAreaFromSize(img.size);
        if (baseArea === null) return sum;
        const qty = Math.max(1, costQuantities?.[img.path] || 1);
        const unitPrice = costUnitPrices?.[img.path] ?? 0;
        return sum + baseArea * qty * unitPrice;
      }, 0);

      const escapeHtml = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const rows = supported
        .map((img, idx) => {
          const qty = Math.max(1, costQuantities?.[img.path] || 1);
          const baseArea = calcAreaFromSize(img.size);
          const singleArea = baseArea !== null ? baseArea.toFixed(4) : "—";
          const totalArea = baseArea !== null ? (baseArea * qty).toFixed(4) : "—";
          const unitPrice = costUnitPrices?.[img.path] ?? 0;
          const amount = baseArea !== null ? (baseArea * qty * unitPrice).toFixed(2) : "—";
          const remark = costRemarks?.[img.path] ?? "";
          const src = thumbBase64[img.path] || "";
          const thumbCell = src ? `<td class="thumb"><img src="${escapeHtml(src)}" alt="" /></td>` : "<td class=\"thumb\">—</td>";
          return `<tr>
  <td>${idx + 1}</td>
  ${thumbCell}
  <td>${escapeHtml(img.name)}</td>
  <td>${qty}</td>
  <td>${escapeHtml(img.size)}</td>
  <td>${singleArea}</td>
  <td>${totalArea}</td>
  <td>${unitPrice > 0 ? unitPrice.toFixed(2) : "—"}</td>
  <td>${amount}</td>
  <td>${escapeHtml(remark)}</td>
</tr>`;
        })
        .join("\n");

      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const title = `报价单 ${dateStr} ${timeStr}`;

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; padding: 16px; background: #f5f5f5; }
  h1 { font-size: 18px; color: #333; margin-bottom: 12px; }
  table { border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-radius: 8px; overflow: hidden; }
  th, td { border: 1px solid #e5e5e5; padding: 8px 10px; text-align: left; font-size: 13px; }
  th { background: #f8f8f8; font-weight: 600; color: #555; }
  td.thumb { padding: 4px; width: 80px; text-align: center; vertical-align: middle; }
  td.thumb img { max-width: 72px; max-height: 72px; object-fit: contain; display: block; margin: 0 auto; }
  tr.total { background: #f0f9ff; font-weight: 600; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead><tr>
  <th>序号</th><th>缩略图</th><th>文件名</th><th>数量</th><th>物理尺寸(cm)</th><th>单张面积(㎡)</th><th>总面积(㎡)</th><th>单价(元/㎡)</th><th>金额(元)</th><th>备注</th>
</tr></thead>
<tbody>
${rows}
<tr class="total"><td colspan="6">合计</td><td>${grandTotalArea.toFixed(4)}</td><td></td><td>${grandTotalAmount.toFixed(2)}</td><td></td></tr>
</tbody>
</table>
</body>
</html>`;

      const htmlFilename = `报价单_${dateStr}_${timeStr}.html`;
      const savedHtmlPath = await invoke<string>("export_file", { content: html, filename: htmlFilename });
      const pdfFilename = htmlFilename.replace(/\.html$/i, ".pdf");
      const sep = savedHtmlPath.includes("\\") ? "\\" : "/";
      const folderPath = savedHtmlPath.substring(0, savedHtmlPath.lastIndexOf(sep));
      const pdfPath = folderPath + sep + pdfFilename;
      try {
        await invoke<string>("html_to_pdf", { htmlPath: savedHtmlPath, pdfPath });
        if (folderPath) await openPath(folderPath).catch(() => {});
        setExportMsg({ type: "ok", text: `已保存到桌面：${pdfFilename}` });
      } catch {
        if (folderPath) await openPath(folderPath).catch(() => {});
        setExportMsg({ type: "ok", text: `已保存 HTML：${htmlFilename}，可用浏览器打开后打印为 PDF` });
      }
    } catch (e) {
      setExportMsg({ type: "err", text: `导出失败：${e}` });
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  const scale = listZoom / 100;
  const columnTemplate = "40px 60px 200px 60px 100px 80px 72px 88px 110px 60px";
  const thumbSize = Math.max(28, Math.round(48 * scale));
  const rowPaddingY = Math.max(8, Math.round(12 * scale));

  const totalArea = images.reduce((sum, img) => {
    const baseArea = calcAreaFromSize(img.size);
    if (baseArea === null) return sum;
    const qty = Math.max(1, costQuantities?.[img.path] || 1);
    return sum + baseArea * qty;
  }, 0);

  const totalAmount = images.reduce((sum, img) => {
    if (!img.isSupported) return sum;
    const baseArea = calcAreaFromSize(img.size);
    if (baseArea === null) return sum;
    const qty = Math.max(1, costQuantities?.[img.path] || 1);
    const unitPrice = costUnitPrices?.[img.path] ?? 0;
    return sum + baseArea * qty * unitPrice;
  }, 0);

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 顶部操作栏 */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600">成本核算 - {images.length} 项 · 总面积 {totalArea.toFixed(4)} ㎡ · 总金额 ¥{totalAmount.toFixed(2)}</span>
          {exportMsg && (
            <span className={`text-xs px-2 py-1 rounded-md font-medium ${exportMsg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {exportMsg.text}
            </span>
          )}
        </div>
        {images.length > 0 && (
          <div className="flex gap-3 items-center">
            <button
              disabled={disabled || isExporting || images.filter(i => i.isSupported).length === 0}
              onClick={handleExportHtml}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {isExporting ? "导出中..." : "导出报价单"}
            </button>
            <div className="flex items-center gap-2 bg-gray-200/50 px-3 py-1.5 rounded-full border border-gray-200/80 shadow-inner">
              <span className="text-xs text-gray-400 opacity-80">🔍</span>
              <input
                disabled={disabled}
                type="range"
                min="80"
                max="250"
                step="1"
                value={listZoom}
                onChange={(e) => setListZoom(Number(e.target.value))}
                className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className="text-[11px] text-gray-500 w-9 text-right">{listZoom}%</span>
            </div>
            <button disabled={disabled} onClick={onSelectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">全选</button>
            <button disabled={disabled} onClick={onDeselectAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">取消</button>
            <div className="w-px h-5 bg-gray-200"></div>
            <button disabled={disabled} onClick={onClearAll} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">一键清空</button>
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
          <div className="text-center">单价(元/㎡)</div>
          <div className="text-center">金额(元)</div>
          <div className="text-center">备注</div>
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
                const unitPrice = costUnitPrices?.[img.path] ?? 0;
                const amount = baseArea !== null ? baseArea * qty * unitPrice : 0;
                return (
                  <div
                    key={img.path}
                    onClick={() => { if (!disabled) onToggleSelect(index); }}
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
                      disabled={disabled}
                      type="number"
                      min="1"
                      value={costQuantities?.[img.path] || 1}
                      onChange={(e) => {
                        e.stopPropagation();
                        const qty = Math.max(1, parseInt(e.currentTarget.value) || 1);
                        onUpdateCostQuantity?.(img.path, qty);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 text-xs font-bold text-center border border-orange-300 rounded-md focus:outline-none focus:border-orange-500 focus:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    
                    <div className={`text-xs text-center font-mono ${img.isSupported ? "text-blue-600" : "text-red-500 font-bold"}`}>
                      {img.size}
                    </div>
                    
                    <div className="text-xs text-center text-gray-600 font-mono">{areaM2}</div>
                    
                    <input
                      disabled={disabled}
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitPrice === 0 ? "" : unitPrice}
                      onChange={(e) => {
                        e.stopPropagation();
                        const v = parseFloat(e.currentTarget.value);
                        onUpdateCostUnitPrice?.(img.path, Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="—"
                      className="w-full px-2 py-1 text-xs font-bold text-center border border-amber-300 rounded-md focus:outline-none focus:border-amber-500 focus:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    
                    <div className="text-xs text-center font-mono font-semibold text-gray-700">{amount > 0 ? amount.toFixed(2) : "—"}</div>
                    
                    <input
                      disabled={disabled}
                      type="text"
                      value={costRemarks?.[img.path] ?? ""}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdateCostRemark?.(img.path, e.currentTarget.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="备注"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    
                    <div className="flex items-center justify-center">
                      {img.isSupported && (
                        <button disabled={disabled} onClick={(e) => { e.stopPropagation(); onRemoveOne?.(img.path); }} className="text-xs text-red-600 bg-white px-1.5 py-0.5 rounded-md border border-red-100 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">移除</button>
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
                <div className="text-xs text-center font-mono font-bold text-blue-700">{totalArea.toFixed(4)} ㎡</div>
                <div></div>
                <div className="text-xs text-center font-mono font-bold text-green-700">¥{totalAmount.toFixed(2)}</div>
                <div></div>
                <div></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
