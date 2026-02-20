import { ImageItem } from "../types";

export const PAPER_CATEGORIES = [
  "210蚀刻", "315蚀刻", "水彩纸", "硫化钡", "博物馆蚀刻",
  "光泽相纸", "绒面相纸", "亚光相纸", "粗面水彩", "纯棉平滑",
  "金属相纸", "宣纸", "油画布", "灯箱片", "背胶PP"
];

interface PaperSettingProps {
  activePaper: string;
  setActivePaper: (paper: string) => void;
  customPaper: string;
  setCustomPaper: (paper: string) => void;
  selectedCount: number;
  onExecute: () => void;
}

export default function PaperSetting({
  activePaper, setActivePaper, customPaper, setCustomPaper, selectedCount, onExecute
}: PaperSettingProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">纸张类目分配</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">应用后将自动命名为 <br/><span className="font-mono text-gray-700 bg-gray-100 px-1 py-0.5 rounded">类目-序号.后缀</span></p>
        </div>

        <div className="overflow-y-auto pr-1 custom-scrollbar grid grid-cols-3 gap-2 content-start mb-4">
          {PAPER_CATEGORIES.map((cat) => (
            <button 
              key={cat} 
              onClick={() => { setActivePaper(cat); setCustomPaper(""); }} 
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
            type="text" placeholder="例如：日本和纸" value={customPaper}
            onChange={(e) => setCustomPaper(e.target.value)}
            className={`w-full bg-gray-50 border-2 rounded-xl py-2 px-3 text-sm focus:bg-white outline-none transition-all ${
              customPaper.trim() !== "" ? "border-blue-500 ring-2 ring-blue-100 bg-white" : "border-gray-200 focus:border-blue-400"
            }`}
          />
        </div>
      </div>

      <button 
        onClick={onExecute} disabled={selectedCount === 0} 
        className="w-full mt-6 py-4 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
      >
        <span>执行修改与命名</span>
        {selectedCount > 0 && <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-mono">{selectedCount}</span>}
      </button>
    </div>
  );
}