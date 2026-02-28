import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactCrop, { Crop, centerCrop, makeAspectCrop, PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ImageItem } from "../types";

export interface ProcessPayload {
  image: ImageItem;
  mode: string;
  targetW: number;
  targetH: number;
  borderTopCm?: number;
  borderRightCm?: number;
  borderBottomCm?: number;
  borderLeftCm?: number;
  cropData: {x: number, y: number, w: number, h: number};
}

interface CropSettingProps {
  selectedImages: ImageItem[];
  disabled?: boolean;
  onProcessAll: (payloads: ProcessPayload[]) => void;
}

interface CustomPreset {
  label: string;
  w: number;
  h: number;
}

interface ImageConfig {
  preset: string;
  customW: number | '';
  customH: number | '';
  isLinked: boolean;
  linkedAspect: number;
  mode: string; 
  crop: Crop;
  resizeW: number | '';
  resizeH: number | '';
  resizeLinked: boolean;
  borderLinked?: boolean;
  borderTopCm?: number | '';
  borderRightCm?: number | '';
  borderBottomCm?: number | '';
  borderLeftCm?: number | '';
  isCropFlipped?: boolean;
}

const parseSize = (sizeStr?: string): [number, number] => {
  if (!sizeStr) return [20, 20];
  const match = sizeStr.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  return [20, 20];
};

export default function CropSetting({ selectedImages, disabled, onProcessAll }: CropSettingProps) {
  const [ , setConfigs] = useState<Record<string, ImageConfig>>({});
  const configsRef = useRef<Record<string, ImageConfig>>({});

  const [currentDpi, setCurrentDpi] = useState<number | null>(null);
  
  const loadedImagePathRef = useRef<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [presets, setPresets] = useState<CustomPreset[]>(() => {
    const saved = localStorage.getItem('user_custom_presets');
    return saved ? JSON.parse(saved) : [];
  });

  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [newPresetW, setNewPresetW] = useState<number | ''>('');
  const [newPresetH, setNewPresetH] = useState<number | ''>('');

  const [activePreset, setActivePreset] = useState<string>("图像尺寸");
  const [customW, setCustomW] = useState<number | ''>(20);
  const [customH, setCustomH] = useState<number | ''>(20);
  const [isLinked, setIsLinked] = useState<boolean>(true);
  const [linkedAspect, setLinkedAspect] = useState<number>(1);
  
  const [resizeW, setResizeW] = useState<number | ''>(20);
  const [resizeH, setResizeH] = useState<number | ''>(20);
  const [resizeLinked, setResizeLinked] = useState<boolean>(true);
  const [resizeEditedField, setResizeEditedField] = useState<"w" | "h" | null>(null);
  const [resizeInputDirty, setResizeInputDirty] = useState<boolean>(false);
  const [borderLinked, setBorderLinked] = useState<boolean>(true);
  const [borderTopCm, setBorderTopCm] = useState<number | ''>(0.2);
  const [borderRightCm, setBorderRightCm] = useState<number | ''>(0.2);
  const [borderBottomCm, setBorderBottomCm] = useState<number | ''>(0.2);
  const [borderLeftCm, setBorderLeftCm] = useState<number | ''>(0.2);

  const [mode, setMode] = useState<string>("crop");
  const [isCropFlipped, setIsCropFlipped] = useState<boolean>(false);
  
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [imgRef, setImgRef] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const handleConfigImported = () => {
      const saved = localStorage.getItem("user_custom_presets");
      if (!saved) {
        setPresets([]);
        return;
      }
      try {
        const parsed = JSON.parse(saved) as unknown;
        setPresets(Array.isArray(parsed) ? parsed as CustomPreset[] : []);
      } catch {
        setPresets([]);
      }
    };

    window.addEventListener("imagetool-config-imported", handleConfigImported);
    return () => {
      window.removeEventListener("imagetool-config-imported", handleConfigImported);
    };
  }, []);

  useEffect(() => {
    if (selectedImages.length === 0) {
      setConfigs({});
      configsRef.current = {};
      loadedImagePathRef.current = null;
    }
    if (currentIndex >= selectedImages.length) setCurrentIndex(Math.max(0, selectedImages.length - 1));
  }, [selectedImages.length, currentIndex]);

  useEffect(() => {
    if (selectedImages.length > 1) {
      setResizeEditedField("w");
      setResizeInputDirty(false);
    } else {
      setResizeEditedField(null);
      setResizeInputDirty(false);
    }
  }, [selectedImages.length]);

  const handleSetResizeBatchBasis = (basis: "w" | "h") => {
    if (selectedImages.length <= 1) return;
    setResizeEditedField(basis);
    setResizeInputDirty(false);
  };

  const currentImage = selectedImages.length > 0 ? selectedImages[currentIndex] : undefined;

  const updateConfig = (path: string, updates: Partial<ImageConfig>) => {
    setConfigs(prev => {
      const newConf = { ...(prev[path] || {}), ...updates } as ImageConfig;
      configsRef.current[path] = newConf;
      return { ...prev, [path]: newConf };
    });
  };

  const getAspectFromParams = (imgW: number, imgH: number, presetLabel: string, cW: number|'', cH: number|'', currentMode: string, isFlipped: boolean) => {
    let w = 1, h = 1;
    if (presetLabel === "图像尺寸") {
      w = Number(cW) || 1; h = Number(cH) || 1;
    } else {
      const preset = presets.find(p => p.label === presetLabel);
      w = preset ? preset.w : 20; 
      h = preset ? preset.h : 20;
    }
    let aspect = w / h;

    if (currentMode === "pad") {
      if (imgW && imgH) {
        const isImgLandscape = imgW > imgH;
        if (isImgLandscape !== (aspect > 1)) aspect = 1 / aspect;
      }
    } else if (currentMode === "crop") {
      if (imgW && imgH) {
         const isImgLandscape = imgW >= imgH;
         const isAspectLandscape = aspect >= 1;
         if (isImgLandscape !== isAspectLandscape) {
             aspect = 1 / aspect;
         }
      }
      if (isFlipped) {
        aspect = 1 / aspect;
      }
    }
    return aspect; 
  };

  const generateDefaultCrop = (imgW: number, imgH: number, aspect: number): Crop => {
    if (!imgW || !imgH) return { unit: "%", x: 0, y: 0, width: 100, height: 100 }; 
    const imageAspect = imgW / imgH;
    if (aspect > imageAspect) {
      return centerCrop(makeAspectCrop({ unit: '%', width: 100 }, aspect, imgW, imgH), imgW, imgH);
    } else {
      return centerCrop(makeAspectCrop({ unit: '%', height: 100 }, aspect, imgW, imgH), imgW, imgH);
    }
  };

  const getFallbackConfig = (origW: number, origH: number) => {
    return {
      preset: activePreset, 
      customW: customW, 
      customH: customH,
      isLinked: isLinked, 
      linkedAspect: linkedAspect, 
      mode: mode,
      resizeW: origW, // 🌟 核心修复：原来是 resizeW，现改为 origW，强制读取当前图的真实宽！
      resizeH: origH, // 🌟 核心修复：原来是 resizeH，现改为 origH，强制读取当前图的真实高！
      resizeLinked: resizeLinked,
      borderLinked: borderLinked,
      borderTopCm: borderTopCm,
      borderRightCm: borderRightCm,
      borderBottomCm: borderBottomCm,
      borderLeftCm: borderLeftCm,
      crop: { unit: "%", x: 0, y: 0, width: 100, height: 100 },
      isCropFlipped: false
    } as ImageConfig;
  };

  useEffect(() => {
    if (currentImage) {
       const conf = configsRef.current[currentImage.path];
       const [origW, origH] = parseSize(currentImage.size);
       const sourceConf = conf || getFallbackConfig(origW, origH);
       const isBatchResizeMode = selectedImages.length > 1 && mode === "resize";
       
       setActivePreset(sourceConf.preset);
       setCustomW(sourceConf.customW); setCustomH(sourceConf.customH);
       setIsLinked(sourceConf.isLinked); setLinkedAspect(sourceConf.linkedAspect);
       setIsCropFlipped(sourceConf.isCropFlipped || false);
       if (!isBatchResizeMode) {
         setResizeW(sourceConf.resizeW); setResizeH(sourceConf.resizeH); setResizeLinked(sourceConf.resizeLinked);
       }
      setBorderLinked(sourceConf.borderLinked ?? true);
       setBorderTopCm(sourceConf.borderTopCm ?? 0.2);
       setBorderRightCm(sourceConf.borderRightCm ?? 0.2);
       setBorderBottomCm(sourceConf.borderBottomCm ?? 0.2);
       setBorderLeftCm(sourceConf.borderLeftCm ?? 0.2);
       
       if (conf) {
           setCrop(conf.crop); 
       }
    }
  }, [currentIndex, selectedImages]);

  useEffect(() => {
    if (!currentImage) { 
        setPreviewUrl(""); setImgRef(null); loadedImagePathRef.current = null; return; 
    }
    if (currentImage.url !== previewUrl) {
      setPreviewUrl(currentImage.url);
      setImgRef(null);
      loadedImagePathRef.current = null; 
    }
    // 当预览改变或当前图片改变时，获取结构化元数据（包含 DPI）
    if (currentImage) {
      invoke("get_image_meta", { pathStr: currentImage.path })
        .then((m: any) => {
          if (m && typeof m.dpi === 'number') setCurrentDpi(m.dpi);
          else setCurrentDpi(null);
        })
        .catch(() => setCurrentDpi(null));
    } else {
      setCurrentDpi(null);
    }
  }, [currentImage, previewUrl]);

  // 🌟 终极暴力 Hack：缩短为 10ms，低于显示器单帧刷新时间，彻底消灭视觉闪烁！
  // 🌟 工业级渲染同步方案：完美应对 200MB 级别的大图！
  // 彻底告别魔法数字延迟，让浏览器在彻底完成物理绘制后再通知我们计算
  useEffect(() => {
    if (mode === 'crop' && imgRef && currentImage) {
      let rafId1: number;
      let rafId2: number;

      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          // 此时，无论图片是 2MB 还是 200MB，DOM 的物理宽高都已经绝对稳定！
          const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, activePreset, customW, customH, mode, isCropFlipped);
          const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
          setCrop(newCrop);
        });
      });

      return () => {
        cancelAnimationFrame(rafId1);
        cancelAnimationFrame(rafId2);
      };
    }
  }, [currentIndex, imgRef, activePreset, customW, customH, isCropFlipped, mode]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgRef(img);
    if (!currentImage) return;

    const path = currentImage.path;
    loadedImagePathRef.current = path;

    const conf = configsRef.current[path];
    const [origW, origH] = parseSize(currentImage.size);

    if (conf) {
      const isBatchResizeMode = selectedImages.length > 1 && mode === "resize";
      setActivePreset(conf.preset); setCustomW(conf.customW); setCustomH(conf.customH);
      setIsLinked(conf.isLinked); setLinkedAspect(conf.linkedAspect);
      if (!isBatchResizeMode) {
        setResizeW(conf.resizeW); setResizeH(conf.resizeH); setResizeLinked(conf.resizeLinked);
      }
      setBorderLinked(conf.borderLinked ?? true);
      setBorderTopCm(conf.borderTopCm ?? 0.2);
      setBorderRightCm(conf.borderRightCm ?? 0.2);
      setBorderBottomCm(conf.borderBottomCm ?? 0.2);
      setBorderLeftCm(conf.borderLeftCm ?? 0.2);
      setCrop(conf.crop); setIsCropFlipped(conf.isCropFlipped || false);
    } else {
      const fallback = getFallbackConfig(origW, origH);
      const aspect = getAspectFromParams(img.naturalWidth, img.naturalHeight, fallback.preset, fallback.customW, fallback.customH, fallback.mode, fallback.isCropFlipped || false);
      const newCrop = generateDefaultCrop(img.naturalWidth, img.naturalHeight, aspect);
      
      updateConfig(path, {
        preset: fallback.preset, customW: fallback.customW, customH: fallback.customH, 
        isLinked: fallback.isLinked, linkedAspect: fallback.linkedAspect, mode: fallback.mode, crop: newCrop,
        resizeW: fallback.resizeW, resizeH: fallback.resizeH, resizeLinked: fallback.resizeLinked,
        borderLinked: fallback.borderLinked,
        borderTopCm: fallback.borderTopCm,
        borderRightCm: fallback.borderRightCm,
        borderBottomCm: fallback.borderBottomCm,
        borderLeftCm: fallback.borderLeftCm,
        isCropFlipped: fallback.isCropFlipped || false
      });
      setIsCropFlipped(fallback.isCropFlipped || false);
      setCrop(newCrop);
    }
  };

  const handleCropChange = (_c: Crop, percentCrop: PercentCrop) => { 
    setCrop(percentCrop); 
  };

  const handleCropComplete = (_c: Crop, percentCrop: PercentCrop) => {
    if (currentImage && loadedImagePathRef.current === currentImage.path) {
        updateConfig(currentImage.path, { crop: percentCrop }); 
    }
  };

  const handlePresetClick = (label: string) => {
    setActivePreset(label);
    setIsCropFlipped(false); 
    let w: number | '' = 20, h: number | '' = 20;
    if (label === "图像尺寸") {
      w = Number(customW) || 1; h = Number(customH) || 1;
    } else {
      const preset = presets.find(p => p.label === label);
      w = preset ? preset.w : 20; h = preset ? preset.h : 20;
      setCustomW(w); setCustomH(h); setLinkedAspect(Number(w) / Number(h));
    }
    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, label, w, h, mode, false);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: label, customW: w, customH: h, linkedAspect: Number(w)/Number(h), crop: newCrop, isCropFlipped: false });
  };

  const handleCustomWChange = (val: string) => {
    const num: number | '' = val === '' ? '' : Number(val);
    setActivePreset("图像尺寸");
    let newW: number | '' = num;
    let newH: number | '' = customH;
    let newAspect: number = linkedAspect;
    if (isLinked && num !== '') newH = Number((num / linkedAspect).toFixed(2));
    else if (!isLinked && num !== '' && customH !== '') newAspect = num / Number(customH);
    setCustomW(newW); setCustomH(newH); setLinkedAspect(newAspect);
    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, "图像尺寸", newW, newH, mode, isCropFlipped);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: "图像尺寸", customW: newW, customH: newH, linkedAspect: newAspect, crop: newCrop });
  };

  const handleCustomHChange = (val: string) => {
    const num: number | '' = val === '' ? '' : Number(val);
    setActivePreset("图像尺寸");
    let newW: number | '' = customW;
    let newH: number | '' = num;
    let newAspect: number = linkedAspect;
    if (isLinked && num !== '') newW = Number((num * linkedAspect).toFixed(2));
    else if (!isLinked && num !== '' && customW !== '') newAspect = Number(customW) / num;
    setCustomW(newW); setCustomH(newH); setLinkedAspect(newAspect);
    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, "图像尺寸", newW, newH, mode, isCropFlipped);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { preset: "图像尺寸", customW: newW, customH: newH, linkedAspect: newAspect, crop: newCrop });
  };

  const toggleCropOrientation = () => {
    const newFlipped = !isCropFlipped;
    setIsCropFlipped(newFlipped);
    if (!imgRef || !currentImage) return;
    const aspect = getAspectFromParams(imgRef.naturalWidth, imgRef.naturalHeight, activePreset, customW, customH, mode, newFlipped);
    const newCrop = generateDefaultCrop(imgRef.naturalWidth, imgRef.naturalHeight, aspect);
    setCrop(newCrop);
    updateConfig(currentImage.path, { isCropFlipped: newFlipped, crop: newCrop });
  };

  const toggleLink = () => {
    if (!isLinked && customW !== '' && customH !== '') {
      const aspect = Number(customW) / Number(customH);
      setLinkedAspect(aspect);
      if (currentImage) updateConfig(currentImage.path, { linkedAspect: aspect, isLinked: true });
    } else {
      if (currentImage) updateConfig(currentImage.path, { isLinked: false });
    }
    setIsLinked(!isLinked);
  };

  const handleResizeWChange = (val: string) => {
    const num: number | '' = val === '' ? '' : Number(val);

    if (selectedImages.length > 1) {
      if (resizeEditedField === "h") return;
      setResizeW(num);
      if (num === '') {
        setResizeInputDirty(false);
        setResizeH('');
        return;
      }
      setResizeEditedField("w");
      setResizeInputDirty(true);
      if (currentImage) {
        const [origW, origH] = parseSize(currentImage.size);
        const ratio = origW / origH;
        setResizeH(Number((Number(num) / ratio).toFixed(2)));
      }
      return;
    }

    let newW: number | '' = num;
    let newH: number | '' = resizeH;
    if (resizeLinked && num !== '' && currentImage) {
      const [origW, origH] = parseSize(currentImage.size);
      newH = Number((num / (origW / origH)).toFixed(2));
    }
    setResizeW(newW); setResizeH(newH);
    if (currentImage) updateConfig(currentImage.path, { resizeW: newW, resizeH: newH });
  };

  const handleResizeHChange = (val: string) => {
    const num: number | '' = val === '' ? '' : Number(val);

    if (selectedImages.length > 1) {
      if (resizeEditedField === "w") return;
      setResizeH(num);
      if (num === '') {
        setResizeInputDirty(false);
        setResizeW('');
        return;
      }
      setResizeEditedField("h");
      setResizeInputDirty(true);
      if (currentImage) {
        const [origW, origH] = parseSize(currentImage.size);
        const ratio = origW / origH;
        setResizeW(Number((Number(num) * ratio).toFixed(2)));
      }
      return;
    }

    let newW: number | '' = resizeW;
    let newH: number | '' = num;
    if (resizeLinked && num !== '' && currentImage) {
      const [origW, origH] = parseSize(currentImage.size);
      newW = Number((num * (origW / origH)).toFixed(2));
    }
    setResizeW(newW); setResizeH(newH);
    if (currentImage) updateConfig(currentImage.path, { resizeW: newW, resizeH: newH });
  };

  const toggleResizeLink = () => {
    if (selectedImages.length > 1) return;

    const newLinked = !resizeLinked;
    setResizeLinked(newLinked);
    if (newLinked && resizeW !== '' && currentImage) {
      const [origW, origH] = parseSize(currentImage.size);
      const newH = Number((Number(resizeW) / (origW / origH)).toFixed(2));
      setResizeH(newH);
      if (currentImage) updateConfig(currentImage.path, { resizeLinked: newLinked, resizeH: newH });
    } else {
      if (currentImage) updateConfig(currentImage.path, { resizeLinked: newLinked });
    }
  };

  const handleSetMode = (m: string) => { 
    if (disabled) return;
    setMode(m); 
    if (currentImage) updateConfig(currentImage.path, { mode: m }); 
  };

  const handleBorderSideChange = (side: "top" | "right" | "bottom" | "left", val: string) => {
    const num: number | '' = val === '' ? '' : Number(val);
    const safe = num;

    if (borderLinked) {
      setBorderTopCm(safe);
      setBorderRightCm(safe);
      setBorderBottomCm(safe);
      setBorderLeftCm(safe);
    } else {
      if (side === "top") setBorderTopCm(safe);
      if (side === "right") setBorderRightCm(safe);
      if (side === "bottom") setBorderBottomCm(safe);
      if (side === "left") setBorderLeftCm(safe);
    }

    const numericBorder = safe === '' ? 0 : safe;
    setConfigs(prev => {
      const next = { ...prev };
      selectedImages.forEach((img) => {
        const base = next[img.path] || getFallbackConfig(...parseSize(img.size));
        const updated: ImageConfig = {
          ...base,
          borderLinked: borderLinked,
          borderTopCm: borderLinked ? numericBorder : (side === "top" ? numericBorder : (base.borderTopCm ?? 0)),
          borderRightCm: borderLinked ? numericBorder : (side === "right" ? numericBorder : (base.borderRightCm ?? 0)),
          borderBottomCm: borderLinked ? numericBorder : (side === "bottom" ? numericBorder : (base.borderBottomCm ?? 0)),
          borderLeftCm: borderLinked ? numericBorder : (side === "left" ? numericBorder : (base.borderLeftCm ?? 0))
        };
        next[img.path] = updated;
        configsRef.current[img.path] = updated;
      });
      return next;
    });
  };

  const toggleBorderLink = () => {
    const nextLinked = !borderLinked;
    setBorderLinked(nextLinked);

    setConfigs(prev => {
      const next = { ...prev };
      selectedImages.forEach((img) => {
        const base = next[img.path] || getFallbackConfig(...parseSize(img.size));
        const syncValue = Number(borderTopCm) || 0;
        const updated: ImageConfig = {
          ...base,
          borderLinked: nextLinked,
          borderTopCm: nextLinked ? syncValue : (base.borderTopCm ?? borderTopCm ?? 0),
          borderRightCm: nextLinked ? syncValue : (base.borderRightCm ?? borderRightCm ?? 0),
          borderBottomCm: nextLinked ? syncValue : (base.borderBottomCm ?? borderBottomCm ?? 0),
          borderLeftCm: nextLinked ? syncValue : (base.borderLeftCm ?? borderLeftCm ?? 0),
        };
        next[img.path] = updated;
        configsRef.current[img.path] = updated;
      });
      return next;
    });

    if (nextLinked) {
      const syncValue = Number(borderTopCm) || 0;
      setBorderTopCm(syncValue);
      setBorderRightCm(syncValue);
      setBorderBottomCm(syncValue);
      setBorderLeftCm(syncValue);
    }
  };

  const handleSavePreset = () => {
    if (!newPresetLabel.trim() || !newPresetW || !newPresetH) return alert("请填写完整的模版名称、宽度和高度！");
    if (presets.some(p => p.label === newPresetLabel.trim())) return alert("该模版名称已存在，请换一个名称！");
    const newPreset = { label: newPresetLabel.trim(), w: Number(newPresetW), h: Number(newPresetH) };
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets); localStorage.setItem('user_custom_presets', JSON.stringify(updatedPresets));
    setIsAddingPreset(false); setNewPresetLabel(""); setNewPresetW(""); setNewPresetH("");
    handlePresetClick(newPreset.label);
  };

  const handleDeletePreset = (e: React.MouseEvent, label: string) => {
    e.stopPropagation(); 
    const updatedPresets = presets.filter(p => p.label !== label);
    setPresets(updatedPresets); localStorage.setItem('user_custom_presets', JSON.stringify(updatedPresets));
    if (activePreset === label) handlePresetClick("图像尺寸"); 
  };

  const handleExecuteAll = () => {
    if (disabled) return;
    try {
      if (mode === "resize") {
        if (selectedImages.length > 1) {
          const clearBatchResizeParams = () => {
            setResizeW('');
            setResizeH('');
            setResizeInputDirty(false);
          };

          if (!resizeInputDirty || !resizeEditedField) {
            clearBatchResizeParams();
            return;
          }

          const baseW = Number(resizeW);
          const baseH = Number(resizeH);
          if (resizeEditedField === "w" && (!Number.isFinite(baseW) || baseW <= 0)) {
            clearBatchResizeParams();
            return;
          }
          if (resizeEditedField === "h" && (!Number.isFinite(baseH) || baseH <= 0)) {
            clearBatchResizeParams();
            return;
          }

          const payloads: ProcessPayload[] = selectedImages.map((img) => {
            const [origW, origH] = parseSize(img.size);
            const ratio = origW / origH;
            const targetW = resizeEditedField === "w" ? baseW : Number((baseH * ratio).toFixed(2));
            const targetH = resizeEditedField === "h" ? baseH : Number((baseW / ratio).toFixed(2));
            return {
              image: img,
              mode: "resize",
              targetW,
              targetH,
              cropData: { x: 0, y: 0, w: 100, h: 100 }
            };
          });

          onProcessAll(payloads);
          clearBatchResizeParams();
          return;
        }

        const img = selectedImages[currentIndex];
        if (!img) return;
        const conf = configsRef.current[img.path];
        let outW = Number(resizeW) || 1;
        let outH = Number(resizeH) || 1;
        if (conf) { outW = Number(conf.resizeW) || 1; outH = Number(conf.resizeH) || 1; }
        
        onProcessAll([{ image: img, mode: "resize", targetW: outW, targetH: outH, cropData: { x: 0, y: 0, w: 100, h: 100 } }]);
        
      } else {
        const payloads: ProcessPayload[] = [];
        const newConfigsToSave: Record<string, ImageConfig> = {};

        selectedImages.forEach((img) => {
          let conf = configsRef.current[img.path];
          if (!conf) {
            const [origW, origH] = parseSize(img.size);
            const fallback = getFallbackConfig(origW, origH);
            const aspect = getAspectFromParams(origW, origH, fallback.preset, fallback.customW, fallback.customH, fallback.mode, fallback.isCropFlipped || false);
            const autoCrop = generateDefaultCrop(origW, origH, aspect);
            conf = { ...fallback, crop: autoCrop };
            newConfigsToSave[img.path] = conf; 
          }

          let outW = 20, outH = 20, px = 0, py = 0, pw = 100, ph = 100;
          const finalMode =
            mode === "border"
              ? "border"
              : mode === "crop" || mode === "pad"
                ? mode
                : conf.mode;
          if (finalMode === "resize") {
             outW = Number(conf.resizeW) || 1; outH = Number(conf.resizeH) || 1;
           } else if (finalMode === "border") {
             const [curW, curH] = parseSize(img.size);
             outW = curW;
             outH = curH;
          } else {
             if (conf.preset === "图像尺寸") { outW = Number(conf.customW) || 1; outH = Number(conf.customH) || 1; } 
             else { const p = presets.find(x => x.label === conf.preset); outW = p ? p.w : 20; outH = p ? p.h : 20; }
             px = conf.crop.x; py = conf.crop.y; pw = conf.crop.width; ph = conf.crop.height;
             
             if (finalMode === "crop") {
                 const [origW, origH] = parseSize(img.size);
                 const isImgLandscape = origW >= origH;
                 const isAspectLandscape = outW >= outH;
                 if (isImgLandscape !== isAspectLandscape) {
                     const temp = outW; outW = outH; outH = temp;
                 }
                 if (conf.isCropFlipped) {
                     const temp = outW; outW = outH; outH = temp;
                 }
             }
          }

          if (finalMode === "pad") {
            let [fileRawW, fileRawH] = parseSize(img.size);
            if ((fileRawW > fileRawH) !== (outW > outH)) { const temp = outW; outW = outH; outH = temp; }
          }
          payloads.push({
            image: img,
            mode: finalMode,
            targetW: outW,
            targetH: outH,
            borderTopCm: finalMode === "border" ? (borderTopCm === '' ? Number(conf.borderTopCm ?? 0) : Number(borderTopCm)) : 0,
            borderRightCm: finalMode === "border" ? (borderRightCm === '' ? Number(conf.borderRightCm ?? 0) : Number(borderRightCm)) : 0,
            borderBottomCm: finalMode === "border" ? (borderBottomCm === '' ? Number(conf.borderBottomCm ?? 0) : Number(borderBottomCm)) : 0,
            borderLeftCm: finalMode === "border" ? (borderLeftCm === '' ? Number(conf.borderLeftCm ?? 0) : Number(borderLeftCm)) : 0,
            cropData: { x: px, y: py, w: pw, h: ph }
          });
        });

        onProcessAll(payloads);

        if (Object.keys(newConfigsToSave).length > 0) {
            setConfigs(prev => {
                const n = {...prev};
                Object.entries(newConfigsToSave).forEach(([path, conf]) => {
                    n[path] = conf;
                    configsRef.current[path] = conf;
                });
                return n;
            });
        }
      }
    } catch (e) {
      console.error("❌ 崩溃:", e);
      alert("打包排版数据时发生错误！");
    }
  };

  if (selectedImages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <p className="text-xs text-gray-400 font-bold">请勾选需要处理的图片</p>
      </div>
    );
  }

  const isModuleAActive = mode === "crop" || mode === "pad";

  return (
    <div className="flex flex-col flex-1 bg-white p-3 rounded-xl shadow-sm border border-gray-100 h-full min-h-0 relative">
      <div className="w-full h-48 bg-gray-50/80 rounded-lg overflow-hidden mb-3 border border-gray-200 flex flex-col items-center justify-center p-1.5 shrink-0 relative group">
        <div className="absolute top-2 left-2 z-10 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded backdrop-blur-sm font-bold shadow-sm">
          正在查阅: {currentIndex + 1} / {selectedImages.length}
        </div>
        
        {mode === "crop" ? (
          <ReactCrop 
             key={currentImage?.path || 'empty'} 
             crop={crop} 
             onChange={handleCropChange} 
             onComplete={handleCropComplete}
             aspect={getAspectFromParams(imgRef?.naturalWidth||1, imgRef?.naturalHeight||1, activePreset, customW, customH, mode, isCropFlipped)} 
             className="flex-shrink-0"
          >
            <img src={previewUrl} alt="Preview" onLoad={handleImageLoad} style={{ display: 'block', maxWidth: '100%', maxHeight: '176px', width: 'auto', height: 'auto' }} />
          </ReactCrop>
        ) : mode === "border" ? (
          (() => {
            const [w, h] = parseSize(currentImage?.size);
            const imageAspect = (w > 0 && h > 0) ? (w / h) : 1;

            return (
              <div
                className="bg-white shadow border border-gray-200 flex items-center justify-center transition-all duration-300 relative"
                style={{
                  aspectRatio: imageAspect,
                  maxHeight: "176px",
                  maxWidth: "100%",
                  padding: "0px"
                }}
              >
                <img src={previewUrl} onLoad={handleImageLoad} alt="Preview" className="w-full h-full object-contain" />
              </div>
            );
          })()
        ) : (
          <div className="bg-white shadow border border-gray-200 flex items-center justify-center transition-all duration-300 relative" style={{ aspectRatio: mode === 'resize' ? (Number(resizeW) || 1) / (Number(resizeH) || 1) : getAspectFromParams(imgRef?.naturalWidth||1, imgRef?.naturalHeight||1, activePreset, customW, customH, mode, isCropFlipped), maxHeight: '176px', maxWidth: '100%', padding: '0px' }}>
            <img src={previewUrl} onLoad={handleImageLoad} alt="Preview" className="w-full h-full object-contain" />
          </div>
        )}
      </div>

      {/* DPI 警告：当探测到 DPI 低于 100 时在渲染框下部展示 */}
      {currentDpi !== null && currentDpi < 100 && (
        <div className="mb-2 px-3 py-2 w-full text-sm rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800">
          <strong className="font-bold">警告：</strong> 图像分辨率 {currentDpi.toFixed(0)} DPI，低于 100 DPI，打印可能失真或模糊。
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
        <div className={`border-2 rounded-xl overflow-hidden transition-all duration-300 ${isModuleAActive ? 'border-blue-400 shadow-sm bg-white' : 'border-gray-200 bg-gray-50/50 hover:border-blue-200 cursor-pointer'}`}>
          <div className={`p-2 flex items-center gap-2 ${isModuleAActive ? 'bg-blue-50 border-b border-blue-100' : ''}`} onClick={() => !disabled && !isModuleAActive && handleSetMode('crop')}>
             <div className={`w-3.5 h-3.5 rounded-full border-2 flex flex-shrink-0 items-center justify-center ${isModuleAActive ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`}>
               {isModuleAActive && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
             </div>
             <span className={`text-[11px] font-bold ${isModuleAActive ? 'text-blue-800' : 'text-gray-500'}`}>模块 A：画板排版</span>
          </div>
          {isModuleAActive && (
            <div className="p-2 space-y-3 animate-fade-in-down">
              <div className="flex bg-gray-100 p-0.5 rounded-md shrink-0">
                <button disabled={disabled} onClick={() => handleSetMode("crop")} className={`flex-1 py-1 text-xs font-bold rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'crop' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>物理裁切</button>
                <button disabled={disabled} onClick={() => handleSetMode("pad")} className={`flex-1 py-1 text-xs font-bold rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'pad' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>等比留白</button>
              </div>
              <div>
                
                <div className="flex justify-between items-end mb-1.5">
                  <h3 className="text-[10px] font-bold text-gray-400">模版库与输出尺寸</h3>
                  <div className="flex gap-1">
                    {mode === 'crop' && (
                      <button disabled={disabled} onClick={toggleCropOrientation} className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isCropFlipped ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 border border-orange-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'}`}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                        {isCropFlipped ? '已翻转 (点击还原)' : '一键横竖互换'}
                      </button>
                    )}
                    <button disabled={disabled} onClick={() => setIsAddingPreset(!isAddingPreset)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">+ 新增</button>
                  </div>
                </div>

                {isAddingPreset && (
                  <div className="mb-2 p-1.5 bg-gray-50 border border-gray-200 rounded-md flex flex-col gap-1.5">
                    <input disabled={disabled} type="text" placeholder="备注 (如: 海报 5x10)" value={newPresetLabel} onChange={e => setNewPresetLabel(e.target.value)} className="w-full px-2 py-1 text-[11px] font-bold border border-gray-200 rounded outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                    <div className="flex gap-1 items-center">
                      <span className="text-[10px] text-gray-500">宽:</span>
                      <input disabled={disabled} type="number" value={newPresetW} onChange={e => setNewPresetW(Number(e.target.value) || '')} className="flex-1 w-0 px-1 py-1 text-[11px] text-center border border-gray-200 rounded outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">高:</span>
                      <input disabled={disabled} type="number" value={newPresetH} onChange={e => setNewPresetH(Number(e.target.value) || '')} className="flex-1 w-0 px-1 py-1 text-[11px] text-center border border-gray-200 rounded outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                      <button disabled={disabled} onClick={handleSavePreset} className="px-2 py-1 bg-blue-500 text-white text-[10px] rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">保存</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {presets.map(preset => (
                    <div key={preset.label} className="relative group">
                      <button disabled={disabled} onClick={() => handlePresetClick(preset.label)} className={`w-full py-1 text-[11px] font-bold border rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${activePreset === preset.label ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{preset.label}</button>
                      <button disabled={disabled} onClick={(e) => handleDeletePreset(e, preset.label)} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-100 text-red-500 rounded-full text-[8px] hidden group-hover:flex items-center justify-center hover:bg-red-500 hover:text-white z-10 disabled:opacity-40 disabled:cursor-not-allowed">×</button>
                    </div>
                  ))}
                  <button disabled={disabled} onClick={() => handlePresetClick("图像尺寸")} className={`col-span-2 py-1 text-[11px] font-bold border rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${activePreset === "图像尺寸" ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>图像尺寸 (自由设定)</button>
                </div>
                {activePreset === "图像尺寸" && (
                   <div className="flex gap-1 mt-1.5 items-center justify-center bg-gray-50 p-1.5 rounded-md border border-gray-100">
                      <button disabled={disabled} onClick={toggleLink} className={`p-1 bg-white border border-gray-200 shadow-sm rounded disabled:opacity-40 disabled:cursor-not-allowed ${isLinked ? 'text-blue-600' : 'text-gray-400'}`}>
                        {isLinked ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M13.2 7.8l-1.4-1.4c-1.5-1.5-4-1.5-5.5 0l-2.8 2.8c-1.5 1.5-1.5 4 0 5.5l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.7-.7-.7-2 0-2.8l2.8-2.8c.8-.8 2-.8 2.8 0l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c1.5 1.5 4 1.5 5.5 0l2.8-2.8c1.5-1.5 1.5-4.1 0-5.6z"/></svg> : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>}
                      </button>
                      
                      <span className="text-[10px] text-gray-500">宽:</span>
                      <input disabled={disabled} type="number" value={customW} onChange={e => handleCustomWChange(e.target.value)} className="w-12 px-1 py-1 text-[11px] font-bold text-center border rounded outline-none disabled:opacity-40 disabled:cursor-not-allowed" />

                      <span className="text-[10px] text-gray-500">高:</span>
                      <input disabled={disabled} type="number" value={customH} onChange={e => handleCustomHChange(e.target.value)} className="w-12 px-1 py-1 text-[11px] font-bold text-center border rounded outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                   </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`border-2 rounded-xl overflow-hidden transition-all duration-300 ${mode === 'resize' ? 'border-purple-400 shadow-sm bg-white' : 'border-gray-200 bg-gray-50/50 hover:border-purple-200 cursor-pointer'}`}>
          <div className={`p-2 flex items-center gap-2 ${mode === 'resize' ? 'bg-purple-50 border-b border-purple-100' : ''}`} onClick={() => !disabled && handleSetMode('resize')}>
             <div className={`w-3.5 h-3.5 rounded-full border-2 flex flex-shrink-0 items-center justify-center ${mode === 'resize' ? 'border-purple-600 bg-purple-600' : 'border-gray-400'}`}>
               {mode === 'resize' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
             </div>
             <span className={`text-[11px] font-bold ${mode === 'resize' ? 'text-purple-800' : 'text-gray-500'}`}>模块 B：图像大小 (纯缩放)</span>
          </div>
          {mode === 'resize' && (
            <div className="p-3 animate-fade-in-down">
               {selectedImages.length > 1 && (
                <div className="mb-2 flex items-center justify-center gap-2">
                  <button
                    disabled={disabled}
                    onClick={() => handleSetResizeBatchBasis("w")}
                    className={`px-2 py-1 text-[10px] rounded border font-bold disabled:opacity-40 disabled:cursor-not-allowed ${resizeEditedField === "w" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-purple-600 border-purple-300"}`}
                  >
                    按宽批量
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => handleSetResizeBatchBasis("h")}
                    className={`px-2 py-1 text-[10px] rounded border font-bold disabled:opacity-40 disabled:cursor-not-allowed ${resizeEditedField === "h" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-purple-600 border-purple-300"}`}
                  >
                    按高批量
                  </button>
                </div>
               )}
               <div className="flex gap-2 items-center justify-center bg-purple-50/50 p-2 rounded-md border border-purple-100">
                    <button disabled={disabled || selectedImages.length > 1} onClick={toggleResizeLink} className={`p-1.5 bg-white border border-purple-200 shadow-sm rounded disabled:opacity-40 disabled:cursor-not-allowed ${resizeLinked || selectedImages.length > 1 ? 'text-purple-600' : 'text-gray-400'}`}>
                    {resizeLinked ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13.2 7.8l-1.4-1.4c-1.5-1.5-4-1.5-5.5 0l-2.8 2.8c-1.5 1.5-1.5 4 0 5.5l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.7-.7-.7-2 0-2.8l2.8-2.8c.8-.8 2-.8 2.8 0l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c1.5 1.5 4 1.5 5.5 0l2.8-2.8c1.5-1.5 1.5-4.1 0-5.6z"/></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>}
                  </button>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-gray-600 w-4">宽:</span>
                        <input disabled={disabled || (selectedImages.length > 1 && resizeEditedField !== "w")} type="number" value={resizeW} onChange={e => handleResizeWChange(e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-purple-200 outline-none focus:border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-gray-600 w-4">高:</span>
                        <input disabled={disabled || (selectedImages.length > 1 && resizeEditedField !== "h")} type="number" value={resizeH} onChange={e => handleResizeHChange(e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-purple-200 outline-none focus:border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                  </div>
               </div>
                 {selectedImages.length > 1 && (
                  <div className="mt-2 text-[10px] text-purple-700 text-center">
                    批量模式：先选择“按宽批量 / 按高批量”，只允许输入一边，另一边按每张图原比例自动计算。未输入时不执行。
                  </div>
                 )}
            </div>
          )}
        </div>

        <div className={`border-2 rounded-xl overflow-hidden transition-all duration-300 ${mode === 'border' ? 'border-emerald-400 shadow-sm bg-white' : 'border-gray-200 bg-gray-50/50 hover:border-emerald-200 cursor-pointer'}`}>
          <div className={`p-2 flex items-center gap-2 ${mode === 'border' ? 'bg-emerald-50 border-b border-emerald-100' : ''}`} onClick={() => !disabled && handleSetMode('border')}>
             <div className={`w-3.5 h-3.5 rounded-full border-2 flex flex-shrink-0 items-center justify-center ${mode === 'border' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-400'}`}>
               {mode === 'border' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
             </div>
             <span className={`text-[11px] font-bold ${mode === 'border' ? 'text-emerald-800' : 'text-gray-500'}`}>模块 C：加白边（批量）</span>
          </div>
          {mode === 'border' && (
            <div className="p-3 animate-fade-in-down">
              <div className="bg-emerald-50/60 p-2 rounded-md border border-emerald-100">
                <div className="grid grid-cols-3 gap-2 items-center">
                  <div></div>
                  <label className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-600">
                    <span>上</span>
                    <div className="flex items-center gap-1">
                      <input disabled={disabled} type="number" step="0.1" value={borderTopCm} onChange={e => handleBorderSideChange("top", e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-emerald-200 outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                  </label>
                  <div></div>

                  <label className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-600">
                    <span>左</span>
                    <div className="flex items-center gap-1">
                      <input disabled={disabled} type="number" step="0.1" value={borderLeftCm} onChange={e => handleBorderSideChange("left", e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-emerald-200 outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                  </label>

                  <div className="flex items-center justify-center">
                    <button
                      disabled={disabled}
                      onClick={toggleBorderLink}
                      className={`p-1.5 rounded border shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${borderLinked ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-gray-400 border-emerald-200'}`}
                      title={borderLinked ? '已联动（四边同步）' : '未联动（四边独立）'}
                    >
                      {borderLinked ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13.2 7.8l-1.4-1.4c-1.5-1.5-4-1.5-5.5 0l-2.8 2.8c-1.5 1.5-1.5 4 0 5.5l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.7-.7-.7-2 0-2.8l2.8-2.8c.8-.8 2-.8 2.8 0l1.4 1.4c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.4-1.4c-.4-.4-1-.4-1.4 0s-.4 1 0 1.4l1.4 1.4c1.5 1.5 4 1.5 5.5 0l2.8-2.8c1.5-1.5 1.5-4.1 0-5.6z"/></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                      )}
                    </button>
                  </div>

                  <label className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-600">
                    <span>右</span>
                    <div className="flex items-center gap-1">
                      <input disabled={disabled} type="number" step="0.1" value={borderRightCm} onChange={e => handleBorderSideChange("right", e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-emerald-200 outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                  </label>

                  <div></div>
                  <label className="flex flex-col items-center gap-1 text-[11px] font-bold text-gray-600">
                    <span>下</span>
                    <div className="flex items-center gap-1">
                      <input disabled={disabled} type="number" step="0.1" value={borderBottomCm} onChange={e => handleBorderSideChange("bottom", e.target.value)} className="w-16 px-1 py-1 text-xs font-bold text-center border rounded border-emerald-200 outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                      <span className="text-[10px] text-gray-500">cm</span>
                    </div>
                  </label>
                  <div></div>
                </div>
              </div>
              <div className="text-[10px] text-emerald-700 mt-2 text-center">
                {borderLinked ? "联动中：修改任一方向会同步四边" : "独立模式：上/右/下/左分别设置"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100 shrink-0 flex items-center justify-between gap-2">
        <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={disabled || currentIndex === 0} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 text-gray-600 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button disabled={disabled} onClick={handleExecuteAll} className={`flex-1 h-10 text-white rounded-lg text-[13px] font-bold shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'resize' ? 'bg-purple-600 hover:bg-purple-700' : mode === 'border' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#0B1527] hover:bg-black'}`}>
          {mode === 'resize' ? (selectedImages.length > 1 ? `批量缩放 (${selectedImages.length}张)` : `执行当前图像 (${currentIndex + 1} / ${selectedImages.length})`) : mode === 'border' ? `加白边 (${selectedImages.length}张)` : `裁切 (${selectedImages.length}张)`}
        </button>
        <button onClick={() => setCurrentIndex(prev => Math.min(selectedImages.length - 1, prev + 1))} disabled={disabled || currentIndex === selectedImages.length - 1} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100 text-gray-600 rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}