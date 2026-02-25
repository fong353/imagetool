import { ProcessProgress } from "../types";

interface ProgressBarProps {
  progress: ProcessProgress;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  if (!progress.isProcessing) return null;

  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-96 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">处理进度</h3>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            {progress.current}/{progress.total}
          </span>
        </div>

        {/* 当前处理的文件名 */}
        <div className="mb-2">
          <p className="text-sm text-gray-600 truncate">
            <span className="text-gray-400">处理中：</span>
            <span className="text-gray-900 font-semibold">{progress.currentName}</span>
          </p>
        </div>

        {/* 进度条容器 */}
        <div className="mb-4">
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
            <div
              className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 text-right">
            {percentage.toFixed(0)}%
          </p>
        </div>

        {/* 状态消息 */}
        <div className="flex items-center gap-2">
          <div className="animate-spin">
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full" />
          </div>
          <p className="text-sm text-gray-700">{progress.statusMessage}</p>
        </div>
      </div>
    </div>
  );
}
