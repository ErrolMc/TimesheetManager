"use client";

interface WeekPickerProps {
  value: string;
  onChange: (date: string) => void;
}

export default function WeekPicker({ value, onChange }: WeekPickerProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = new Date(e.target.value + "T00:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const monday = d.toISOString().split("T")[0];
    onChange(monday);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Week Starting
      </label>
      <input
        type="date"
        value={value}
        onChange={handleChange}
        className="input-field"
      />
    </div>
  );
}
