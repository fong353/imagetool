import { useState, useEffect, useRef } from "react";
import ReactCrop, { Crop, centerCrop, makeAspectCrop, PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ProcessMode, ImageItem } from "../types";

export interface ProcessPayload {
  image: ImageItem;
  mode: ProcessMode;
  targetW: number;
  targetH: number;
  cropData: {x: number, y: number, w: number, h: number};
}

interface CropSettingProps {
  selectedImages: ImageItem[];
  onProcessAll: (payloads: ProcessPayload[]) => void;
}

const PRESETS = [
  { label: "A4", w: 21.0, h: 29.7 },
  { label: "A3", w: 29.7, h: 42.0 },
  { label: "6寸", w: 10.2, h: 15.2 },
  { label: "10寸", w: 20.3, h: 25.4 }
];

interface ImageConfig {
  preset: string;
  customW: number | '';
  customH: number | '';
  isLinked: boolean;
  linkedAspect: number;
  mode: ProcessMode;
  crop: Crop;
}

// 解析尺寸字符串的辅助工具
const parseSize = (sizeStr?: string): [number, number] => {
  if (!sizeStr) return [20, 20];
  const match = sizeStr.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  return [20, 20];
};

export default function CropSetting({ selectedImages, onProcessAll }: CropSettingProps) {
  const [ , setConfigs] = useState<Record<string, ImageConfig>>({});
  const configsRef = useRef<Record<string, ImageConfig>>({});
  const isFirstImageInitRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);

  // 🌟 统一为物理尺寸状态
  const [activePreset, setActivePreset] = useState<string>("自定义尺寸");
  const [customW, setCustomW] = useState<number | ''>(20);
  const [customH, setCustomH] = useState<number | ''>(20);
  const [isLinked, setIsLinked] = useState<boolean>(true);
  const [linkedAspect, setLinkedAspect] = useState<number>(1);
  
  const [mode, setMode] = useState<ProcessMode>("crop");
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (selectedImages.length === 0) {
      isFirstImageInitRef.current = false;
      setConfigs({});
      configsRef.current = {};
    }
    if (currentIndex >= selectedImages.length) setCurrentIndex(Math.max(0, selectedImages.length - 1));
  }, [selectedImages.length, currentIndex]);

  const currentImage = selectedImages.length > 0 ? selectedImages[currentIndex] : undefined;

  const updateConfig = (path: string, updates: Partial<ImageConfig>) => {
    setConfigs(prev => {
      const newConf = { ...(prev[path] || {}), ...updates } as ImageConfig;
      configsRef.current[path] = newConf;
      return { ...prev, [path]: newConf };
    });
  };

  const getAspectFromParams = (imgW: number, imgH: number, presetLabel: string, cW: number|'', cH: number|'') => {
    let w = 1, h = 1;
    if (presetLabel === "自定义尺寸") {
      w = Number(cW) || 1; h = Number(cH) || 1;
    } else {
      const preset = PRESETS.find(p => p.label === presetLabel) || PRESETS[0];
      w = preset.w; h = preset.h;
    }
    let aspect = w / h;
    if (imgW && imgH) {
      const isImgLandscape = imgW > imgH;
      if (isImgLandscape !== (aspect > 1)) aspect = 1 / aspect;
    }
    return aspect;
  };

  const generateDefaultCrop = (imgW: number, imgH: number, aspect: number): Crop => {
    const imageAspect = imgW / imgH;
    if (aspect > imageAspect) {
      return centerCrop(makeAspectCrop({ unit: '%', width: 100 }, aspect, imgW, imgH), imgW, imgH);
    } else {
      return centerCrop(makeAspectCrop({ unit: '%', height: 100 }, aspect, imgW, imgH), imgW, imgH);
    }
  };

  useEffect(() => {
    if (!currentImage) { setPreviewUrl(""); setImgRef(null); return; }
    if (currentImage.url !== previewUrl) {
      setPreviewUrl(currentImage.url);
      setImgRef(null);
    }
  }, [currentImage, previewUrl]);

  // 🌟 核心：初始化逻辑（自动读取原图尺寸作为初始模版）
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgRef(img);
    if (!currentImage) return;

    const path = currentImage.path;
    const conf = configsRef.current[path];

    if (conf) {
      setActivePreset(conf.preset);
      setCustomW(conf.customW);
      setCustomH(conf.customH);
      setIsLinked(conf.isLinked);
      setLinkedAspect(conf.linkedAspect);
      setMode(conf.mode);
      setCrop(conf.crop);
    } else {
      const [origW, origH] = parseSize(currentImage.size);

      let finalPreset = activePreset;
      let finalW = customW;
      let finalH = customH;
      let finalLinkedAspect = linkedAspect;

      // 第一张图：模版初始值为它本身的物理尺寸
      if (!isFirstImageInitRef.current) {
        finalPreset = "自定义尺寸";
        finalW = origW;
        finalH = origH;
        finalLinkedAspect = origW / origH;
        setActivePreset(finalPreset);
        setCustomW(finalW);
        setCustomH(finalH);
        setLinkedAspect(finalLinkedAspect);
        setIsLinked(true);
        isFirstImageInitRef.current = true;
      } else {
        // 后续图：继承当前的全局模版尺寸
        if (finalPreset === "自定义尺寸") {
          finalW = Number(customW) || 1;
          finalH = Number(customH) || 1;
        } else {
          const p = PRESETS.find(x => x.label === finalPreset) || PRESETS[0];
          finalW = p.w; finalH = p.h;
        }
      }

      const aspect = getAspectFromParams(img.naturalWidth, img.naturalHeight, finalPreset, finalW, finalH);
      const newCrop = generateDefaultCrop(img.naturalWidth, img.naturalHeight, aspect);
      
      updateConfig(path, {
        preset: finalPreset, customW: finalW, customH: finalH, 
        isLinked: isLinked, linkedAspect: finalLinkedAspect, mode: mode, crop: newCrop
      });
      setCrop(newCrop);
    }
  };

  // 快捷预设点击：不仅切换高亮，同时把数字填入自定义框内，直观显示物理尺寸
  const handlePresetClick = (label: string) => {
    setActivePreset(label);
    let w = 20, h = 20;
    if (label === "自定义尺寸") {
      w = Number(customW) || 1; h = Number(customH) || 1;
    } else {
      const preset = PRESETS.find(p => p.label === label) || PRESETS[0];
      w = preset.w; h = preset.h;
      setCustomW(w); setCustomH(h); setLinkedAspect(w / h);
    }
    
    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, label, w, h);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: label, customW: w, customH: h, linkedAspect: w/h, crop: newCrop });
  };

  // 🌟 核心：宽度改变并联动高度
  const handleCustomWChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setActivePreset("自定义尺寸");
    let newW = num;
    let newH = customH;
    let newAspect = linkedAspect;

    if (isLinked && num !== '') {
      newH = Number((num / linkedAspect).toFixed(2));
    } else if (!isLinked && num !== '' && customH !== '') {
      newAspect = num / Number(customH);
    }

    setCustomW(newW); setCustomH(newH); setLinkedAspect(newAspect);

    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, "自定义尺寸", newW, newH);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: "自定义尺寸", customW: newW, customH: newH, linkedAspect: newAspect, crop: newCrop });
  };

  // 🌟 核心：高度改变并联动宽度
  const handleCustomHChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setActivePreset("自定义尺寸");
    let newW = customW;
    let newH = num;
    let newAspect = linkedAspect;

    if (isLinked && num !== '') {
      newW = Number((num * linkedAspect).toFixed(2));
    } else if (!isLinked && num !== '' && customW !== '') {
      newAspect = Number(customW) / num;
    }

    setCustomW(newW); setCustomH(newH); setLinkedAspect(newAspect);

    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, "自定义尺寸", newW, newH);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: "自定义尺寸", customW: newW, customH: newH, linkedAspect: newAspect, crop: newCrop });
  };

  const toggleLink = () => {
    if (!isLinked && customW && customH) {
      const aspect = Number(customW) / Number(customH);
      setLinkedAspect(aspect);
      if (currentImage) updateConfig(currentImage.path, { linkedAspect: aspect, isLinked: true });
    } else {
      if (currentImage) updateConfig(currentImage.path, { isLinked: false });
    }
    setIsLinked(!isLinked);
  };

  const handleSetMode = (m: ProcessMode) => { setMode(m); if (currentImage) updateConfig(currentImage.path, { mode: m }); };
  const handleCropChange = (_c: Crop, percentCrop: PercentCrop) => { setCrop(percentCrop); if (currentImage) updateConfig(currentImage.path, { crop: percentCrop }); };

  // 🌟 一键执行：使用当前面板或字典里的唯一物理尺寸打包
  const handleExecuteAll = () => {
    console.log("🎯 [面板雷达] 准备组装数据...");
    try {
      const payloads: ProcessPayload[] = selectedImages.map((img) => {
        const conf = configsRef.current[img.path];
        let outW = 20, outH = 20, px = 0, py = 0, pw = 100, ph = 100, finalMode = mode;

        if (conf) {
          if (conf.preset === "自定义尺寸") {
             outW = Number(conf.customW) || 1; outH = Number(conf.customH) || 1;
          } else {
             const p = PRESETS.find(x => x.label === conf.preset) || PRESETS[0];
             outW = p.w; outH = p.h;
          }
          finalMode = conf.mode;
          px = conf.crop.x; py = conf.crop.y; pw = conf.crop.width; ph = conf.crop.height;
        } else {
          // 如果没看过这张图，使用当前 UI 上设定好的全局模版尺寸计算裁切框
          if (activePreset === "自定义尺寸") {
             outW = Number(customW) || 1; outH = Number(customH) || 1;
          } else {
             const p = PRESETS.find(x => x.label === activePreset) || PRESETS[0];
             outW = p.w; outH = p.h;
          }
          const [origW, origH] = parseSize(img.size);
          // 在算百分比坐标时，假设它会占满自身尺寸
          const aspect = getAspectFromParams(origW, origH, activePreset, outW, outH);
          const autoCrop = generateDefaultCrop(origW, origH, aspect);
          px = autoCrop.x; py = autoCrop.y; pw = autoCrop.width; ph = autoCrop.height;
          finalMode = mode;
        }

        // 等比留白垫板防呆：只要垫板和图片横竖不一，在发给后端前翻转输出垫板
        if (finalMode === "pad") {
          let [fileRawW, fileRawH] = parseSize(img.size);
          const isImgLandscape = fileRawW > fileRawH;
          const isPaperLandscape = outW > outH;
          if (isImgLandscape !== isPaperLandscape) {
              const temp = outW; outW = outH; outH = temp;
          }
        }

        return { image: img, mode: finalMode, targetW: outW, targetH: outH, cropData: { x: px, y: py, w: pw, h: ph } };
      });

      console.log("🎯 [面板雷达] 数据打包完毕", payloads);
      onProcessAll(payloads);
    } catch (e) {
      console.error("❌ [面板雷达] 崩溃:", e);
      alert("打包排版数据时发生错误，请查看控制台！");
    }
  };

  if (selectedImages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <p className="text-xs text-gray-400 font-bold">请勾选需要排版的图片</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-white p-3 rounded-xl shadow-sm border border-gray-100 h-full min-h-0 relative">
      
      {/* 视觉预览区 */}
      <div className="w-full h-48 bg-gray-50/80 rounded-lg overflow-hidden mb-3 border border-gray-200 flex flex-col items-center justify-center p-1.5 shrink-0 relative group">
        <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm font-bold shadow-sm">
          正在查阅: {currentIndex + 1} / {selectedImages.length}
        </div>
        
        {mode === "crop" ? (
          <ReactCrop crop={crop} onChange={handleCropChange} aspect={getAspectFromParams(imgRef?.naturalWidth||1, imgRef?.naturalHeight||1, activePreset, customW, customH)} className="flex-shrink-0">
            <img 
              src={previewUrl} alt="Preview" onLoad={handleImageLoad}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '176px', width: 'auto', height: 'auto' }}
            />
          </ReactCrop>
        ) : (
          <div 
            className="bg-white shadow border border-gray-200 flex items-center justify-center transition-all duration-300"
            style={{ aspectRatio: getAspectFromParams(imgRef?.naturalWidth||1, imgRef?.naturalHeight||1, activePreset, customW, customH), maxWidth: '100%', maxHeight: '100%', padding: '1px' }}
          >
            <img src={previewUrl} onLoad={handleImageLoad} alt="Preview" className="w-full h-full object-contain" />
          </div>
        )}
      </div>

      {/* 控制面板区 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        
        <div className="flex bg-gray-100 p-0.5 rounded-md shrink-0">
          <button onClick={() => handleSetMode("crop")} className={`flex-1 py-1 text-xs font-bold rounded transition-all ${mode === 'crop' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>物理裁切</button>
          <button onClick={() => handleSetMode("pad")} className={`flex-1 py-1 text-xs font-bold rounded transition-all ${mode === 'pad' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>等比留白</button>
        </div>

        {selectedImages.length > 1 && mode === "crop" && (
           <div className="bg-amber-50 border border-amber-200 p-2 rounded-md animate-fade-in-down flex gap-2 items-start">
             <span className="text-amber-500 text-xs mt-0.5">⚠️</span>
             <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
               物理裁切将强行切除边缘，批量执行时建议先通过翻页确认关键画面未被裁掉。
             </p>
           </div>
        )}

        {/* ✂️ 模版与尺寸合二为一 */}
        <div>
          <h3 className="text-[11px] font-bold text-gray-400 mb-1.5 tracking-wider">裁切与输出尺寸 (物理大小)</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(preset => (
              <button key={preset.label} onClick={() => handlePresetClick(preset.label)} className={`py-1.5 text-xs font-bold border rounded-md transition-colors ${activePreset === preset.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {preset.label}
              </button>
            ))}
            <button onClick={() => handlePresetClick("自定义尺寸")} className={`col-span-2 py-1.5 text-xs font-bold border rounded-md transition-colors ${activePreset === "自定义尺寸" ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              自定义尺寸
            </button>
          </div>
          
          {activePreset === "自定义尺寸" && (
             <div className="flex gap-1.5 mt-2 items-center justify-center bg-gray-50 p-2 rounded-md border border-gray-100 animate-fade-in-down">
                
                {/* 🔒 等比缩放锁 */}
                <button onClick={toggleLink} className={`p-1 bg-white border border-gray-200 shadow-sm rounded hover:bg-gray-100 transition-colors ${isLinked ? 'text-blue-600' : 'text-gray-400'}`} title="锁定长宽比">
                  {isLinked ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M13.2 7.8l-1.4-1.4c-1.5-1.5-4-1.5-5.5 0l-2.8 2.8c-1.5 1.5-1.5 4 0 5.5l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.7-.7-.7-2 0-2.8l2.8-2.8c.8-.8 2-.8 2.8 0l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c1.5 1.5 4 1.5 5.5 0l2.8-2.8c1.5-1.5 1.5-4.1 0-5.6z"/></svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                  )}
                </button>

                <span className="text-[10px] text-gray-500 font-bold ml-1">宽:</span>
                <input type="number" value={customW} onChange={(e) => handleCustomWChange(e.target.value)} className="w-14 px-1 py-1 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
                
                <span className="text-[10px] text-gray-500 font-bold ml-1">高:</span>
                <input type="number" value={customH} onChange={(e) => handleCustomHChange(e.target.value)} className="w-14 px-1 py-1 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
             </div>
          )}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100 shrink-0 flex items-center justify-between gap-2">
        <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 text-gray-600 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={handleExecuteAll} className="flex-1 h-10 bg-[#0B1527] hover:bg-black text-white rounded-lg text-[13px] font-bold shadow-md active:scale-95 transition-all">
          一键执行打包 ({selectedImages.length}张)
        </button>
        <button onClick={() => setCurrentIndex(prev => Math.min(selectedImages.length - 1, prev + 1))} disabled={currentIndex === selectedImages.length - 1} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 text-gray-600 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}