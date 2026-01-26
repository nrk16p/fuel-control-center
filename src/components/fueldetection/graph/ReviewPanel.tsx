"use client"

import { memo } from "react"
import dayjs from "dayjs"

export type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

interface SelectedRange {
  plate: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  startTs: number
  endTs: number
  fuelStart: number
  fuelEnd: number
  fuelDiff: number
  durationMin: number
}

interface Props {
  selected: SelectedRange
  decision: Decision
  note: string
  saving: boolean
  error: string | null
  onDecisionChange: (decision: Decision) => void
  onNoteChange: (note: string) => void
  onSave: () => void
  onCancel: () => void
}

const DECISION_OPTIONS: Array<{ value: Decision; label: string; icon: string }> = [
  { value: "reviewed_ok", label: "ผ่านการตรวจ (ปกติ)", icon: "✅" },
  { value: "reviewed_suspicious", label: "น้ำมันลดลงผิดปกติ", icon: "⚠️" },
  { value: "false_positive", label: "แจ้งเตือนผิดพลาด", icon: "❌" },
  { value: "need_follow_up", label: "ต้องติดตามเพิ่มเติม", icon: "📌" },
]

function ReviewPanelComponent({
  selected,
  decision,
  note,
  saving,
  error,
  onDecisionChange,
  onNoteChange,
  onSave,
  onCancel,
}: Props) {
  // Display Thai date/time from data source
  const displayTime = `${selected.startDate} ${selected.startTime} → ${selected.endDate} ${selected.endTime}`
  // Also show formatted version for clarity
  const startTime = dayjs(selected.startTs).format("DD MMM YYYY HH:mm")
  const endTime = dayjs(selected.endTs).format("DD MMM YYYY HH:mm")

  const isSameDay =
    dayjs(selected.startTs).format("YYYY-MM-DD") ===
    dayjs(selected.endTs).format("YYYY-MM-DD")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      onSave()
    }
    // Escape to cancel
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-lg space-y-4"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span aria-hidden="true">🚚</span>
          <span>ตรวจสอบรถ {selected.plate}</span>
        </h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          aria-label="ปิด"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Time Range */}
      <div className="flex items-center gap-2 text-sm text-gray-700 bg-white p-3 rounded-lg border">
        <span aria-hidden="true">⏱</span>
        <time dateTime={new Date(selected.startTs).toISOString()}>
          {startTime}
        </time>
        <span>→</span>
        <time dateTime={new Date(selected.endTs).toISOString()}>
          {isSameDay ? endTime.split(" ").pop() : endTime}
        </time>
        <span className="ml-auto text-xs text-gray-500">
          ({selected.durationMin.toLocaleString()} นาที)
        </span>
      </div>

      {/* Fuel Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">เริ่มต้น</div>
          <div className="text-lg font-semibold text-gray-900">
            {selected.fuelStart.toFixed(2)}
            <span className="text-sm font-normal text-gray-500 ml-1">ลิตร</span>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">สิ้นสุด</div>
          <div className="text-lg font-semibold text-gray-900">
            {selected.fuelEnd.toFixed(2)}
            <span className="text-sm font-normal text-gray-500 ml-1">ลิตร</span>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 col-span-2 lg:col-span-1">
          <div className="text-xs text-red-600 mb-1">ลดลง</div>
          <div className="text-lg font-semibold text-red-700">
            {Math.abs(selected.fuelDiff).toFixed(2)}
            <span className="text-sm font-normal text-red-500 ml-1">ลิตร</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Decision Select */}
        <div>
          <label htmlFor="decision" className="block text-sm font-medium text-gray-700 mb-2">
            ผลการตรวจสอบ
          </label>
          <select
            id="decision"
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            value={decision}
            onChange={(e) => onDecisionChange(e.target.value as Decision)}
            disabled={saving}
          >
            {DECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Note Input */}
        <div>
          <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
            หมายเหตุ
            {decision === "reviewed_suspicious" && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </label>
          <textarea
            id="note"
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
            placeholder="ระบุรายละเอียดเพิ่มเติม..."
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            disabled={saving}
            rows={3}
            maxLength={500}
          />
          <div className="flex justify-between mt-1">
            <div className="text-xs text-gray-500">
              {decision === "reviewed_suspicious" && "* จำเป็นสำหรับกรณีน้ำมันลดลงผิดปกติ"}
            </div>
            <div className="text-xs text-gray-400">
              {note.length}/500
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
            role="alert"
          >
            <strong>ข้อผิดพลาด:</strong> {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                กำลังบันทึก...
              </span>
            ) : (
              "บันทึกผลการตรวจสอบ"
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            ยกเลิก
          </button>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="text-xs text-gray-400 text-center pt-1">
          <kbd className="px-2 py-1 bg-gray-100 rounded">Ctrl</kbd> +{" "}
          <kbd className="px-2 py-1 bg-gray-100 rounded">Enter</kbd> เพื่อบันทึก,{" "}
          <kbd className="px-2 py-1 bg-gray-100 rounded">Esc</kbd> เพื่อยกเลิก
        </div>
      </form>
    </div>
  )
}

export const ReviewPanel = memo(ReviewPanelComponent)