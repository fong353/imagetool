import { useState, useEffect, useRef } from "react";

export const PAPER_CATEGORIES = [
  "210蚀刻", "315蚀刻", "水彩纸", "硫化钡", "博物馆蚀刻",
  "光泽相纸", "绒面相纸", "亚光相纸", "粗面水彩", "纯棉平滑",
  "金属相纸", "宣纸", "油画布", "灯箱片", "背胶PP"
];

export const CRAFT_CATEGORIES = ["做框", "卡纸框", "无"];

interface PaperSettingProps {
  activePaper: string;
  setActivePaper: (paper: string) => void;
  // 🌟 恢复传递自定义纸张的属性
  customPaper: string; 
  setCustomPaper: (paper: string) => void; 
  activeCraft: string;
  setActiveCraft: (craft: string) => void;
  disabled?: boolean;
  selectedCount: number;
  onExecute: () => void;
}

export default function PaperSetting({
  activePaper, setActivePaper, customPaper, setCustomPaper, activeCraft, setActiveCraft, disabled, selectedCount, onExecute
}: PaperSettingProps) {

  const [papers, setPapers] = useState<string[]>(() => {
    const saved = localStorage.getItem('app_custom_papers');
    return saved ? JSON.parse(saved) : PAPER_CATEGORIES;
  });

  const [crafts, setCrafts] = useState<string[]>(() => {
    const saved = localStorage.getItem('app_custom_crafts');
    return saved ? JSON.parse(saved) : CRAFT_CATEGORIES;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [newPaper, setNewPaper] = useState("");
  const [newCraft, setNewCraft] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (papers.length > 0 && !papers.includes(activePaper)) setActivePaper(papers[0]);
  }, [papers, activePaper, setActivePaper]);

  useEffect(() => {
    if (crafts.length > 0 && !crafts.includes(activeCraft)) setActiveCraft(crafts[0]);
  }, [crafts, activeCraft, setActiveCraft]);

  const handleAddPaper = () => {
    if (!newPaper.trim() || papers.includes(newPaper.trim())) return;
    const updated = [...papers, newPaper.trim()];
    setPapers(updated); localStorage.setItem('app_custom_papers', JSON.stringify(updated));
    setNewPaper("");
  };

  const handleDeletePaper = (e: React.MouseEvent, paper: string) => {
    e.stopPropagation();
    const updated = papers.filter(p => p !== paper);
    setPapers(updated); localStorage.setItem('app_custom_papers', JSON.stringify(updated));
  };

  const handleAddCraft = () => {
    if (!newCraft.trim() || crafts.includes(newCraft.trim())) return;
    const updated = [...crafts, newCraft.trim()];
    setCrafts(updated); localStorage.setItem('app_custom_crafts', JSON.stringify(updated));
    setNewCraft("");
  };

  const handleDeleteCraft = (e: React.MouseEvent, craft: string) => {
    e.stopPropagation();
    const updated = crafts.filter(c => c !== craft);
    setCrafts(updated); localStorage.setItem('app_custom_crafts', JSON.stringify(updated));
  };

  const handleExportConfig = () => {
    const configData = { papers, crafts };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imagetool_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.papers && Array.isArray(data.papers) && data.crafts && Array.isArray(data.crafts)) {
          setPapers(data.papers);
          setCrafts(data.crafts);
          localStorage.setItem('app_custom_papers', JSON.stringify(data.papers));
          localStorage.setItem('app_custom_crafts', JSON.stringify(data.crafts));
          alert("✅ 车间配置导入成功！数据已同步。");
          setIsEditMode(false); 
        } else {
          alert("❌ 配置文件格式错误，缺少必要的字典字段。");
        }
      } catch (error) {
        alert("❌ 读取配置文件失败，请确保导入的是合法的 JSON 文件。");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
        
        {/* 标题区域 */}
        <div className="flex justify-between items-start mb-1">
          <div>
            <h2 
              onDoubleClick={() => setIsEditMode(!isEditMode)}
              className="text-xl font-bold text-gray-800 tracking-tight cursor-default select-none flex items-center gap-2"
            >
              纸张与工艺分配
              {isEditMode && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-normal animate-pulse">配置模式</span>}
            </h2>
            <p className="text-[11px] text-gray-500 mt-1 mb-3">应用后将自动命名为 <br/><span className="font-mono text-gray-700 bg-gray-100 px-1 py-0.5 rounded">类目-工艺-序号.后缀</span></p>
          </div>
        </div>

        {/* 老板模式：导入/导出 控制台 */}
        {isEditMode && (
          <div className="flex gap-2 mb-4 p-2 bg-gray-100 rounded-lg border border-gray-200 shadow-inner">
             <button disabled={disabled} onClick={handleExportConfig} className="flex-1 bg-white border border-gray-300 text-gray-700 px-2 py-1.5 rounded text-xs font-bold hover:bg-gray-50 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
               ⬇️ 导出配置 (.json)
             </button>
             <button disabled={disabled} onClick={() => fileInputRef.current?.click()} className="flex-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-bold hover:bg-blue-700 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
               ⬆️ 导入配置
             </button>
             <input disabled={disabled} type="file" accept=".json" ref={fileInputRef} onChange={handleImportConfig} className="hidden" />
          </div>
        )}

        {/* --- 纸张区域 --- */}
        <div className="grid grid-cols-3 gap-2 content-start mb-2">
          {papers.map((cat) => (
            <div key={cat} className="relative group">
              <button 
                disabled={disabled}
                // 🌟 点击按钮时，自动清空手动输入框的值
                onClick={() => { setActivePaper(cat); setCustomPaper(""); }} 
                className={`w-full flex items-center justify-center py-2 px-1 rounded-lg border-2 transition-all text-[13px] font-medium active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${ 
                  activePaper === cat && customPaper.trim() === ""
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" 
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-white" 
                }`}
              >
                {cat}
              </button>
              {isEditMode && (
                <button disabled={disabled} onClick={(e) => handleDeletePaper(e, cat)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-100 text-red-500 rounded-full text-[10px] flex items-center justify-center border border-red-200 hover:bg-red-500 hover:text-white z-10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">×</button>
              )}
            </div>
          ))}
        </div>
        
        {/* 老板模式：新增纸张 */}
        {isEditMode && (
          <div className="flex gap-2 mb-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100">
            <input disabled={disabled} type="text" value={newPaper} onChange={e => setNewPaper(e.target.value)} placeholder="新增材质..." className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded outline-none focus:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed" />
            <button disabled={disabled} onClick={handleAddPaper} className="bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">添加</button>
          </div>
        )}

        {/* 🌟 恢复：手动输入材质名称 */}
        <div className="mt-1 border-t border-gray-100 pt-3">
          <h3 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">或手动输入特殊材质 (优先)</h3>
          <input 
            disabled={disabled}
            type="text" placeholder="例如：客户自带特种纸" value={customPaper}
            onChange={(e) => setCustomPaper(e.target.value)}
            className={`w-full bg-gray-50 border-2 rounded-xl py-2 px-3 text-sm focus:bg-white outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              customPaper.trim() !== "" ? "border-blue-500 ring-2 ring-blue-100 bg-white shadow-sm" : "border-gray-200 focus:border-blue-400"
            }`}
          />
        </div>

        {/* --- 工艺区域 --- */}
        <div className="mt-4 border-t border-gray-100 pt-3 mb-2">
          <h3 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">附加后道工艺</h3>
          <div className="grid grid-cols-3 gap-2">
            {crafts.map((craft) => (
              <div key={craft} className="relative group">
                <button 
                  disabled={disabled}
                  onClick={() => setActiveCraft(craft)} 
                  className={`w-full flex items-center justify-center py-2 px-1 rounded-lg border-2 transition-all text-[13px] font-medium active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${ 
                    activeCraft === craft
                    ? "border-green-500 bg-green-50 text-green-700 shadow-sm" 
                    : "border-gray-100 bg-gray-50 text-gray-600 hover:border-green-300 hover:bg-white" 
                  }`}
                >
                  {craft}
                </button>
                {isEditMode && (
                  <button disabled={disabled} onClick={(e) => handleDeleteCraft(e, craft)} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-100 text-red-500 rounded-full text-[10px] flex items-center justify-center border border-red-200 hover:bg-red-500 hover:text-white z-10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 老板模式：新增工艺 */}
        {isEditMode && (
          <div className="flex gap-2 mt-2 p-2 bg-green-50/50 rounded-lg border border-green-100">
            <input disabled={disabled} type="text" value={newCraft} onChange={e => setNewCraft(e.target.value)} placeholder="新增工艺..." className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded outline-none focus:border-green-400 disabled:opacity-40 disabled:cursor-not-allowed" />
            <button disabled={disabled} onClick={handleAddCraft} className="bg-green-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">添加</button>
          </div>
        )}

      </div>

      <button 
        onClick={onExecute} disabled={selectedCount === 0 || disabled} 
        className="w-full mt-4 py-3.5 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2 shrink-0"
      >
        <span>执行改名</span>
        {selectedCount > 0 && <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-mono">{selectedCount}</span>}
      </button>
    </div>
  );
}