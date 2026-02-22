import { ImageItem } from "../types";
import PaperSetting from "./PaperSetting";

interface SidebarProps {
  activePaper: string;
  setActivePaper: (paper: string) => void;
  customPaper: string;
  setCustomPaper: (paper: string) => void;
  // 🌟 新增：接收从 App 传来的工艺状态
  activeCraft: string;
  setActiveCraft: (craft: string) => void;
  selectedImages: ImageItem[];
  onExecuteRename: () => void;
}

export default function Sidebar({
  activePaper,
  setActivePaper,
  customPaper,
  setCustomPaper,
  activeCraft,
  setActiveCraft,
  selectedImages,
  onExecuteRename
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      <PaperSetting 
        activePaper={activePaper} 
        setActivePaper={setActivePaper} 
        customPaper={customPaper} 
        setCustomPaper={setCustomPaper} 
        // 🌟 新增：继续透传给 PaperSetting 面板
        activeCraft={activeCraft}
        setActiveCraft={setActiveCraft}
        selectedCount={selectedImages.length} 
        onExecute={onExecuteRename} 
      />
    </div>
  );
}