import { useState, useEffect } from "react";
import ReactCrop, { Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ProcessMode, ImageItem } from "../types";

interface CropSettingProps {
  selectedImage?: ImageItem;
  onProcess: (mode: ProcessMode, targetW: number, targetH: number, cropData: {x: number, y: number, w: number, h: number}) => void;
}

const PRESETS = [
  { label: "A4", w: 21.0, h: 29.7 },
  { label: "A3", w: 29.7, h: 42.0 },
  { label: "6寸", w: 10.2, h: 15.2 },
  { label: "10寸", w: 20.3, h: 25.4 }
];

export default function CropSetting({ selectedImage, onProcess }: CropSettingProps) {
  const [mode, setMode] = useState<ProcessMode>("crop");
  
  // 1. 裁切比例相关 (仅控制虚线框形状，彻底解耦)
  const [activePreset, setActivePreset] = useState<string>("自定义比例");
  const [customRatioW, setCustomRatioW] = useState<number | ''>(20);
  const [customRatioH, setCustomRatioH] = useState<number | ''>(20);

  // 2. 最终图像物理尺寸相关 (控制导出文件大小)
  const [finalW, setFinalW] = useState<number | ''>(20);
  const [finalH, setFinalH] = useState<number | ''>(20);
  const [isLinked, setIsLinked] = useState<boolean>(true); // 长宽锁
  const [linkedAspect, setLinkedAspect] = useState<number>(1); // 记忆锁定时的比例

  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  // 获取当前裁切框比例
  const getCropAspect = () => {
    if (activePreset === "自定义比例") {
      const w = Number(customRatioW) || 1;
      const h = Number(customRatioH) || 1;
      return w / h;
    }
    const preset = PRESETS.find(p => p.label === activePreset) || PRESETS[0];
    return preset.w / preset.h;
  };

  const cropAspect = getCropAspect();

  // 🌟 核心：选中文件时，瞬间读取文件的真实物理尺寸，并初始化锁定比例
  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl("");
      setImgRef(null);
      return;
    }
    setPreviewUrl(selectedImage.url);

    if (selectedImage.size) {
      // 解析后端传来的尺寸，例如 "21.0 x 29.7 cm"
      const match = selectedImage.size.match(/([\d.]+)\s*x\s*([\d.]+)/);
      if (match) {
        const w = Number(match[1]);
        const h = Number(match[2]);
        setFinalW(w);
        setFinalH(h);
        setLinkedAspect(w / h); // 记忆该文件的初始物理比例
      }
    }
  }, [selectedImage]);

  // 裁切框贴边计算引擎
  useEffect(() => {
    if (mode === "crop" && imgRef && cropAspect) {
      const { naturalWidth, naturalHeight } = imgRef;
      if (!naturalWidth || !naturalHeight) return;

      const imageAspect = naturalWidth / naturalHeight;
      let newCrop;

      if (cropAspect > imageAspect) {
        newCrop = centerCrop(makeAspectCrop({ unit: '%', width: 100 }, cropAspect, naturalWidth, naturalHeight), naturalWidth, naturalHeight);
      } else {
        newCrop = centerCrop(makeAspectCrop({ unit: '%', height: 100 }, cropAspect, naturalWidth, naturalHeight), naturalWidth, naturalHeight);
      }
      setCrop(newCrop);
    }
  }, [cropAspect, imgRef, mode]);

  // ======= 最终尺寸联动逻辑 (Photoshop 级) =======
  
  const toggleLink = () => {
    if (!isLinked && finalW && finalH) {
      // 开启锁定时，抓取当前的宽高比作为新的约束比例
      setLinkedAspect(Number(finalW) / Number(finalH));
    }
    setIsLinked(!isLinked);
  };

  const handleFinalWChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setFinalW(num);
    if (isLinked && num !== '') {
      setFinalH(Number((num / linkedAspect).toFixed(2)));
    } else if (!isLinked && num !== '' && finalH !== '') {
      setLinkedAspect(num / Number(finalH));
    }
  };

  const handleFinalHChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setFinalH(num);
    if (isLinked && num !== '') {
      setFinalW(Number((num * linkedAspect).toFixed(2)));
    } else if (!isLinked && num !== '' && finalW !== '') {
      setLinkedAspect(Number(finalW) / num);
    }
  };

  const getPadPreviewAspect = () => {
    let w = Number(finalW) || 1;
    let h = Number(finalH) || 1;
    if (imgRef) {
      const isImgLandscape = imgRef.naturalWidth > imgRef.naturalHeight;
      const isPaperLandscape = w > h;
      if (isImgLandscape !== isPaperLandscape) {
        const temp = w; w = h; h = temp;
      }
    }
    return w / h;
  };

  const handleExecute = () => {
    const outW = Number(finalW) || 1;
    const outH = Number(finalH) || 1;
    onProcess(mode, outW, outH, { x: crop.x || 0, y: crop.y || 0, w: crop.width || 100, h: crop.height || 100 });
  };

  if (!selectedImage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <p className="text-xs text-gray-400 font-bold">请勾选左侧单张图片</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-white p-3 rounded-xl shadow-sm border border-gray-100 h-full min-h-0">
      
      {/* 视觉预览区 */}
      <div className="w-full h-52 bg-gray-50/80 rounded-lg overflow-hidden mb-3 border border-gray-200 flex items-center justify-center p-1.5 shrink-0">
        {mode === "crop" ? (
          <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} aspect={cropAspect} className="flex-shrink-0">
            <img 
              src={previewUrl} alt="Preview" onLoad={(e) => setImgRef(e.currentTarget)}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '196px', width: 'auto', height: 'auto' }}
            />
          </ReactCrop>
        ) : (
          <div 
            className="bg-white shadow-md border border-gray-200 flex items-center justify-center p-0.5"
            style={{ aspectRatio: getPadPreviewAspect(), maxWidth: '100%', maxHeight: '100%' }}
          >
            <img src={previewUrl} onLoad={(e) => setImgRef(e.currentTarget)} alt="Preview" className="w-full h-full object-contain" />
          </div>
        )}
      </div>

      {/* 控制面板区 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        
        {/* 模式选择 */}
        <div className="flex bg-gray-100 p-0.5 rounded-md">
          <button onClick={() => setMode("crop")} className={`flex-1 py-1 text-xs font-bold rounded ${mode === 'crop' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500'}`}>物理裁切</button>
          <button onClick={() => setMode("pad")} className={`flex-1 py-1 text-xs font-bold rounded ${mode === 'pad' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500'}`}>等比留白</button>
        </div>

        {/* ✂️ 解耦：仅控制裁切比例 */}
        <div>
          <h3 className="text-[11px] font-bold text-gray-400 mb-1.5 tracking-wider">裁切比例</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(preset => (
              <button key={preset.label} onClick={() => setActivePreset(preset.label)} className={`py-1.5 text-xs font-bold border rounded-md ${activePreset === preset.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {preset.label}
              </button>
            ))}
            <button onClick={() => setActivePreset("自定义比例")} className={`col-span-2 py-1.5 text-xs font-bold border rounded-md ${activePreset === "自定义比例" ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              自定义比例
            </button>
          </div>

          {activePreset === "自定义比例" && (
             <div className="flex gap-2 mt-2 items-center bg-gray-50 p-1.5 rounded-md border border-gray-100">
                <span className="text-[10px] text-gray-400 font-bold ml-1 w-6">宽:</span>
                <input type="number" value={customRatioW} onChange={(e) => setCustomRatioW(e.target.value === '' ? '' : Number(e.target.value))} className="w-14 px-1 py-0.5 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
                <span className="text-[10px] text-gray-400 font-bold w-6 text-right">高:</span>
                <input type="number" value={customRatioH} onChange={(e) => setCustomRatioH(e.target.value === '' ? '' : Number(e.target.value))} className="w-14 px-1 py-0.5 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
             </div>
          )}
        </div>

        {/* 🖼️ 最终图像尺寸 (PS 级真图读取与调节) */}
        <div>
          <h3 className="text-[11px] font-bold text-gray-400 mb-1.5 tracking-wider">图像尺寸</h3>
          <div className="p-2 bg-gray-50 border border-gray-200 rounded-md flex">
            
            {/* 锁链约束线 */}
            <div className="w-8 flex flex-col items-center justify-center mr-1 relative">
              <div className="absolute left-[18px] top-[14px] bottom-[14px] w-[10px] border-l-2 border-t-2 border-b-2 border-gray-300 rounded-l"></div>
              <button 
                onClick={toggleLink} 
                className={`relative z-10 bg-gray-50 p-1 rounded hover:bg-gray-200 transition-colors ${isLinked ? 'text-blue-600' : 'text-gray-400'}`}
                title={isLinked ? "取消约束比例" : "约束比例"}
              >
                {isLinked ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13.2 7.8l-1.4-1.4c-1.5-1.5-4-1.5-5.5 0l-2.8 2.8c-1.5 1.5-1.5 4 0 5.5l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.7-.7-.7-2 0-2.8l2.8-2.8c.8-.8 2-.8 2.8 0l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4zm5.5-2.1l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c.8.8.8 2 0 2.8l-2.8 2.8c-.8.8-2 .8-2.8 0l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c1.5 1.5 4 1.5 5.5 0l2.8-2.8c1.5-1.5 1.5-4.1 0-5.6z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                )}
              </button>
            </div>

            {/* 无分辨率版 尺寸输入框 */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center">
                <span className="text-[11px] font-bold text-gray-500 w-10">宽度:</span>
                <input type="number" value={finalW} onChange={(e) => handleFinalWChange(e.target.value)} className="flex-1 w-0 h-7 px-1.5 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none text-right font-semibold text-gray-800" />
                <span className="text-[11px] text-gray-400 w-8 text-right">厘米</span>
              </div>
              <div className="flex items-center">
                <span className="text-[11px] font-bold text-gray-500 w-10">高度:</span>
                <input type="number" value={finalH} onChange={(e) => handleFinalHChange(e.target.value)} className="flex-1 w-0 h-7 px-1.5 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none text-right font-semibold text-gray-800" />
                <span className="text-[11px] text-gray-400 w-8 text-right">厘米</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100 shrink-0">
        <button onClick={handleExecute} className="w-full py-2.5 bg-[#0B1527] hover:bg-black text-white rounded-lg text-sm font-bold shadow-md active:scale-95">
          执行并注入DPI护甲
        </button>
      </div>
    </div>
  );
}