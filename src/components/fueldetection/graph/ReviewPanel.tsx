"use client"

type Decision =
  | "reviewed_ok"
  | "reviewed_suspicious"
  | "false_positive"
  | "need_follow_up"

interface Props {
  selected: any
  decision: Decision
  note: string
  saving: boolean
  onDecisionChange: (d: Decision) => void
  onNoteChange: (v: string) => void
  onSave: () => void
}

export function ReviewPanel({
  selected,
  decision,
  note,
  saving,
  onDecisionChange,
  onNoteChange,
  onSave,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <div className="font-semibold">
        🚚 {selected.plate} | {selected.startDate} {selected.startTime} →{" "}
        {selected.endDate} {selected.endTime}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border p-2">Start: {selected.fuelStart}</div>
        <div className="border p-2">End: {selected.fuelEnd}</div>
        <div className="border p-2">Diff: {selected.fuelDiff.toFixed(2)}</div>
        <div className="border p-2">Duration: {selected.durationMin} min</div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <select
          className="border rounded p-2"
          value={decision}
          onChange={e => onDecisionChange(e.target.value as Decision)}
        >
          <option value="reviewed_ok">✅ ผ่านการตรวจ (ปกติ)</option>
          <option value="reviewed_suspicious">⚠️ น้ำมันลดลงผิดปกติ</option>
          <option value="false_positive">❌ แจ้งเตือนผิดพลาด</option>
          <option value="need_follow_up">📌 ต้องติดตามเพิ่มเติม</option>
        </select>

        <input
          className="border rounded p-2 md:col-span-2"
          placeholder="Note"
          value={note}
          onChange={e => onNoteChange(e.target.value)}
        />
      </div>

      <button
        className="h-9 px-4 rounded-md bg-primary text-white disabled:opacity-50"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Review"}
      </button>
    </div>
  )
}
