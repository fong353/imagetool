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
  
  // 1. 形状控制层 (裁切框/画板比例)
  const [activePreset, setActivePreset] = useState<string>("自定义比例");
  const [customRatioW, setCustomRatioW] = useState<number | ''>(20);
  const [customRatioH, setCustomRatioH] = useState<number | ''>(20);

  // 2. 物理输出层 (最终导出尺寸)
  const [finalW, setFinalW] = useState<number | ''>(20);
  const [finalH, setFinalH] = useState<number | ''>(20);
  const [isLinked, setIsLinked] = useState<boolean>(true); // 长宽锁
  const [linkedAspect, setLinkedAspect] = useState<number>(1);

  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  // 获取当前生效的形状比例
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

  // 选中图片瞬间：秒读真实物理尺寸，初始化长宽锁
  useEffect(() => {
    if (!selectedImage) {
      setPreviewUrl("");
      setImgRef(null);
      return;
    }
    setPreviewUrl(selectedImage.url);

    if (selectedImage.size) {
      const match = selectedImage.size.match(/([\d.]+)\s*x\s*([\d.]+)/);
      if (match) {
        const w = Number(match[1]);
        const h = Number(match[2]);
        setFinalW(w);
        setFinalH(h);
        setLinkedAspect(w / h);
        setCustomRatioW(w);
        setCustomRatioH(h);
        setActivePreset("自定义比例");
      }
    }
  }, [selectedImage]);

  // 🌟 BUG修复1：使用 DOM 宽高生成裁切框，避免产生 Rust 无法消化的超大像素值
  useEffect(() => {
    if (mode === "crop" && imgRef && cropAspect) {
      const { width, height } = imgRef;
      if (!width || !height) return;

      const imageAspect = width / height;
      let newCrop;

      if (cropAspect > imageAspect) {
        newCrop = centerCrop(makeAspectCrop({ unit: '%', width: 100 }, cropAspect, width, height), width, height);
      } else {
        newCrop = centerCrop(makeAspectCrop({ unit: '%', height: 100 }, cropAspect, width, height), width, height);
      }
      setCrop(newCrop);
    }
  }, [cropAspect, imgRef, mode]);


  // ======= UI 与防拉伸逻辑 =======

  const handlePresetClick = (label: string) => {
    setActivePreset(label);
    // 🌟 防拉伸联动：当你点选 A4 比例时，虽然尺寸解耦，但强制将下方尺寸换算为 A4 比例，防止图片输出后被挤扁！
    if (label !== "自定义比例" && finalW) {
        const preset = PRESETS.find(p => p.label === label)!;
        const aspect = preset.w / preset.h;
        setFinalH(Number((Number(finalW) / aspect).toFixed(2)));
        setLinkedAspect(aspect);
    }
  };

  const handleCustomRatioWChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setCustomRatioW(num);
    if (isLinked && finalW !== '' && num !== '' && customRatioH !== '') {
      const aspect = Number(num) / Number(customRatioH);
      setFinalH(Number((Number(finalW) / aspect).toFixed(2)));
      setLinkedAspect(aspect);
    }
  };

  const handleCustomRatioHChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setCustomRatioH(num);
    if (isLinked && finalW !== '' && customRatioW !== '' && num !== '') {
      const aspect = Number(customRatioW) / Number(num);
      setFinalH(Number((Number(finalW) / aspect).toFixed(2)));
      setLinkedAspect(aspect);
    }
  };

  const toggleLink = () => {
    if (!isLinked && finalW && finalH) {
      setLinkedAspect(Number(finalW) / Number(finalH));
    }
    setIsLinked(!isLinked);
  };

  const handleFinalWChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setFinalW(num);
    if (isLinked && num !== '') setFinalH(Number((num / linkedAspect).toFixed(2)));
    else if (!isLinked && num !== '' && finalH !== '') setLinkedAspect(num / Number(finalH));
  };

  const handleFinalHChange = (val: string) => {
    const num = val === '' ? '' : Number(val);
    setFinalH(num);
    if (isLinked && num !== '') setFinalW(Number((num * linkedAspect).toFixed(2)));
    else if (!isLinked && num !== '' && finalW !== '') setLinkedAspect(Number(finalW) / num);
  };

  // 等比留白：智能识别防呆翻转
  const getPadPreviewAspect = () => {
    let aspect = getCropAspect();
    if (imgRef) {
      const isImgLandscape = imgRef.naturalWidth > imgRef.naturalHeight;
      const isPaperLandscape = aspect > 1;
      if (isImgLandscape !== isPaperLandscape) {
        aspect = 1 / aspect;
      }
    }
    return aspect;
  };

  const handleExecute = () => {
    let outW = Number(finalW) || 1;
    let outH = Number(finalH) || 1;

    // 🌟 BUG修复2：强制将前端像素转换为绝对百分比 (0-100)，防止 Rust 触发边界保护导致裁切失效
    let px = 0, py = 0, pw = 100, ph = 100;
    if (crop.unit === '%') {
        px = crop.x; py = crop.y; pw = crop.width; ph = crop.height;
    } else if (imgRef) {
        px = (crop.x / imgRef.width) * 100;
        py = (crop.y / imgRef.height) * 100;
        pw = (crop.width / imgRef.width) * 100;
        ph = (crop.height / imgRef.height) * 100;
    }

    // 留白模式防呆翻转：如果原图和纸张横竖不一，在发给后端前自动对调宽高
    if (mode === "pad" && imgRef) {
      const isImgLandscape = imgRef.naturalWidth > imgRef.naturalHeight;
      const isPaperLandscape = outW > outH;
      if (isImgLandscape !== isPaperLandscape) {
        const temp = outW; outW = outH; outH = temp;
      }
    }

    onProcess(mode, outW, outH, { x: px, y: py, w: pw, h: ph });
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
      
      {/* ====== 视觉预览区 ====== */}
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
            className="bg-white shadow border border-gray-200 flex items-center justify-center"
            style={{ aspectRatio: getPadPreviewAspect(), maxWidth: '100%', maxHeight: '100%', padding: '1px' }}
          >
            <img src={previewUrl} onLoad={(e) => setImgRef(e.currentTarget)} alt="Preview" className="w-full h-full object-contain" />
          </div>
        )}
      </div>

      {/* ====== 控制面板区 ====== */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        
        <div className="flex bg-gray-100 p-0.5 rounded-md shrink-0">
          <button onClick={() => setMode("crop")} className={`flex-1 py-1 text-xs font-bold rounded transition-all ${mode === 'crop' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>物理裁切</button>
          <button onClick={() => setMode("pad")} className={`flex-1 py-1 text-xs font-bold rounded transition-all ${mode === 'pad' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>等比留白</button>
        </div>

        {/* ✂️ 比例设置 (统一名称：自定义比例) */}
        <div>
          <h3 className="text-[11px] font-bold text-gray-400 mb-1.5 tracking-wider">
             比例预设
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(preset => (
              <button key={preset.label} onClick={() => handlePresetClick(preset.label)} className={`py-1.5 text-xs font-bold border rounded-md transition-colors ${activePreset === preset.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {preset.label}
              </button>
            ))}
            <button onClick={() => handlePresetClick("自定义比例")} className={`col-span-2 py-1.5 text-xs font-bold border rounded-md transition-colors ${activePreset === "自定义比例" ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              自定义比例
            </button>
          </div>

          {activePreset === "自定义比例" && (
             <div className="flex gap-2 mt-2 items-center bg-gray-50 p-1.5 rounded-md border border-gray-100 animate-fade-in-down">
                <span className="text-[10px] text-gray-400 font-bold ml-1 w-6">宽:</span>
                <input type="number" value={customRatioW} onChange={(e) => handleCustomRatioWChange(e.target.value)} className="w-14 px-1 py-0.5 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
                <span className="text-[10px] text-gray-400 font-bold w-6 text-right">高:</span>
                <input type="number" value={customRatioH} onChange={(e) => handleCustomRatioHChange(e.target.value)} className="w-14 px-1 py-0.5 text-xs font-bold text-center border border-gray-200 rounded focus:border-blue-500 outline-none" />
                <span className="text-gray-400 font-bold text-[10px]">cm</span>
             </div>
          )}
        </div>

        {/* 🖼️ 最终图像尺寸 (PS 级真图读取与调节) */}
        <div>
          <h3 className="text-[11px] font-bold text-gray-400 mb-1.5 tracking-wider">图像尺寸</h3>
          <div className="p-2 bg-gray-50 border border-gray-200 rounded-md flex">
            
            {/* 长宽约束锁链 */}
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