import { ImageItem } from "../types";

// 将纸张预设直接在这里导出，方便统一管理
export const PAPER_CATEGORIES = [
  "210蚀刻", "315蚀刻", "水彩纸",
  "硫化钡", "博物馆蚀刻", "光泽相纸",
  "绒面相纸", "亚光相纸", "粗面水彩",
  "纯棉平滑", "金属相纸", "宣纸",
  "油画布", "灯箱片", "背胶PP"
];

interface SidebarProps {
  activePaper: string;
  setActivePaper: (paper: string) => void;
  customPaper: string;
  setCustomPaper: (paper: string) => void;
  selectedImages: ImageItem[];
  onExecuteRename: () => void; // 确保接收并触发重命名事件
}

export default function Sidebar({
  activePaper,
  setActivePaper,
  customPaper,
  setCustomPaper,
  selectedImages,
  onExecuteRename
}: SidebarProps) {
  return (
    <div className="flex flex-col flex-1 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 h-full">
      {/* 标题区 */}
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-800 tracking-tight">纸张类目分配</h2>
        <p className="text-xs text-gray-500 mt-1">应用后将自动命名为 类目-序号.后缀</p>
      </div>

      {/* 预设网格 */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {PAPER_CATEGORIES.map(paper => (
          <button
            key={paper}
            onClick={() => {
              setActivePaper(paper);
              setCustomPaper(""); // 点击预设时清空手动输入框
            }}
            className={`py-2 px-1 text-[13px] font-medium border rounded-lg transition-all ${
              activePaper === paper && !customPaper
                ? "border-blue-500 text-blue-600 bg-blue-50"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
            }`}
          >
            {paper}
          </button>
        ))}
      </div>

      {/* 手动输入区 */}
      <div className="mb-6">
        <label className="block text-xs font-bold text-gray-500 mb-2">或手动输入材质名称</label>
        <input
          type="text"
          placeholder="例如：日本和纸"
          value={customPaper}
          onChange={(e) => setCustomPaper(e.target.value)}
          className="w-full text-sm py-2.5 px-3 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition-all placeholder:text-gray-300"
        />
      </div>

      {/* 执行按钮（推到底部） */}
      <div className="mt-auto pt-4">
        <button
          onClick={onExecuteRename}
          disabled={selectedImages.length === 0}
          className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2
            ${selectedImages.length > 0 
              ? "bg-[#0B1527] hover:bg-black text-white active:scale-95" 
              : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
            }`}
        >
          执行修改与命名
          {selectedImages.length > 0 && (
            <span className="bg-blue-500 text-white text-xs py-0.5 px-2 rounded-full font-semibold">
              {selectedImages.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}