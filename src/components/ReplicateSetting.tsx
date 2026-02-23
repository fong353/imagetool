interface ReplicateSettingProps {
  selectedCount: number;
  onExecute: () => void;
}

export default function ReplicateSetting({ selectedCount, onExecute }: ReplicateSettingProps) {
  return (
    <div className="flex flex-col h-full bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center items-center justify-center">
      <div className="w-16 h-16 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-2">多份复制模式</h3>
      <p className="text-xs text-gray-400 mb-6 leading-relaxed">
        请在左侧预览图中点击<span className="text-purple-600 font-bold mx-1">紫色标签</span>修改打印份数。<br/>
        系统将按 1-N 格式自动裂变重命名。
      </p>
      <button onClick={onExecute} disabled={selectedCount === 0} className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
        <span>执行复制裂变</span>
        {selectedCount > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">{selectedCount}项</span>}
      </button>
    </div>
  );
}