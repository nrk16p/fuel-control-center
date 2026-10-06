"use client"

import { useState } from "react"
import BaseRunModal from "./BaseRunModal"
import { triggerPipeline } from "@/lib/etlApi"
import { buildRun, initialForm, type FormState, type FormValue, type JobDef, type JobField } from "@/lib/pipeline-jobs"

export type QueueFn = (type: string, name: string, run: () => Promise<{ job_id?: string }>) => void

interface Props {
  job: JobDef
  onClose: () => void
  onQueue: QueueFn
}

/** Parameter form for one Jobs-tab card. Mount with key={job.type} so each open starts from the defaults. */
export default function RunJobModal({ job, onClose, onQueue }: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm(job))
  const [errors, setErrors] = useState<string[]>([])

  const handleRun = () => {
    const plan = buildRun(job, form)
    if (!plan.ok) {
      setErrors(plan.errors)
      return
    }
    onQueue(job.type, job.name, () => triggerPipeline(job.type, plan.payload))
    for (const next of plan.followUps) onQueue(next.type, next.name, () => triggerPipeline(next.type, next.payload))
    onClose()
  }

  return (
    <BaseRunModal open title={`▶ ${job.name}`} onClose={onClose} onRun={handleRun} runLabel="Run">
      <p className="text-sm text-gray-600">{job.description}</p>
      {job.fields.length === 0 && <p className="text-sm text-gray-500">งานนี้ไม่มีพารามิเตอร์ — กด Run เพื่อเข้าคิว</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {job.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={form[field.key]}
            onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
          />
        ))}
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-red-600">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </BaseRunModal>
  )
}

function Field({ field, value, onChange }: { field: JobField; value: FormValue; onChange: (v: string | boolean) => void }) {
  const id = `job-field-${field.key}`
  const span = field.half ? "" : "sm:col-span-2"
  const inputClass = "mt-1 w-full border rounded px-3 py-2 text-sm"

  if (field.kind === "checkbox") {
    return (
      <label htmlFor={id} className={`${span} flex items-center gap-2 text-sm`}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }

  return (
    <div className={span}>
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      {field.kind === "select" ? (
        <select id={id} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          min={field.kind === "number" ? 1 : undefined}
          step={field.kind === "number" ? 1 : undefined}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  )
}
