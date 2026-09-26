import React from 'react';

export function Slider({
  label,
  hint,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  unsupportedLabel,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  unsupportedLabel?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const id = React.useId();
  return (
    <div className={`field slider${disabled ? ' is-disabled' : ''}`}>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="field-value" dir="ltr">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {disabled && unsupportedLabel ? unsupportedLabel : hint}
        </p>
      )}
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="field toggle">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          className={`switch${checked ? ' is-on' : ''}`}
          onClick={() => onChange(!checked)}
        >
          <span className="switch-knob" />
        </button>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function Select<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = React.useId();
  return (
    <div className="field select">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function RiskBadge({ risk, label }: { risk: string; label: string }) {
  return (
    <span className={`risk risk-${risk.toLowerCase()}`} title={label}>
      {label}
    </span>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="settings-section" id={id} aria-label={title}>
      <h3>{title}</h3>
      <div className="settings-body">{children}</div>
    </section>
  );
}
