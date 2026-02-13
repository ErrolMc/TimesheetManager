"use client";

interface WeekPickerProps {
  value: string;
  onChange: (date: string) => void;
}

export default function WeekPicker({ value, onChange }: WeekPickerProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Period Starting
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
