'use client';

import type { AppOptions, Preset } from '@/lib/optimize';

const PRESETS: { value: Preset; label: string; blurb: string }[] = [
  {
    value: 'safe',
    label: 'Safe',
    blurb: 'Keeps the file re-editable in draw.io and leaves path data byte-for-byte alone.',
  },
  {
    value: 'default',
    label: 'Default',
    blurb: 'Strips editor bookkeeping and tidies geometry. Visually identical.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    blurb: 'Also converts HTML labels to real SVG text. The biggest win, and a fidelity trade.',
  },
];

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex gap-2.5 ${disabled === true ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>
        <span className="block font-medium text-sm">{label}</span>
        <span className="block text-muted text-xs leading-relaxed">{hint}</span>
      </span>
    </label>
  );
}

export function OptionsPanel({
  options,
  onChange,
  disabled,
}: {
  options: AppOptions;
  onChange: (options: AppOptions) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof AppOptions>(key: K, value: AppOptions[K]) =>
    onChange({ ...options, [key]: value });

  return (
    <div className="card p-4 sm:p-5">
      <fieldset disabled={disabled}>
        <legend className="sr-only">Optimization options</legend>

        <div className="space-y-2">
          {PRESETS.map((preset) => (
            <label key={preset.value} className="flex cursor-pointer gap-2.5">
              <input
                type="radio"
                name="preset"
                checked={options.preset === preset.value}
                onChange={() => set('preset', preset.value)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span>
                <span className="block font-medium text-sm">{preset.label}</span>
                <span className="block text-muted text-xs leading-relaxed">{preset.blurb}</span>
              </span>
            </label>
          ))}
        </div>

        <hr className="my-4 border-border" />

        <div className="space-y-3">
          <Toggle
            checked={options.satori}
            onChange={(value) => set('satori', value)}
            label="Convert labels to SVG text"
            hint="Replaces the HTML label boxes with real <text>. Required for a diagram to render outside a browser at all."
          />
          <Toggle
            checked={options.useWebfonts}
            onChange={(value) => set('useWebfonts', value)}
            disabled={!options.satori}
            label="Load webfonts for consistent output"
            hint="Measures text against Google Fonts instead of the fonts installed here, so the result is identical on every machine. Contacts fonts.googleapis.com; your diagram is still never uploaded."
          />
          <Toggle
            checked={options.keepDiagramSource}
            onChange={(value) => set('keepDiagramSource', value)}
            label="Keep the diagram source"
            hint="Preserves the embedded <mxfile> so the SVG can be reopened and edited in draw.io. Removing it is a one-way door."
          />
          <Toggle
            checked={options.consolidateStyles}
            onChange={(value) => set('consolidateStyles', value)}
            label="Fold repeated styles into CSS classes"
            hint="Cuts raw size a lot but gzip barely at all — gzip already dedupes those strings. Worth it for files kept in a repository, not for transfer size."
          />
          <Toggle
            checked={options.pretty}
            onChange={(value) => set('pretty', value)}
            label="Pretty-print the output"
            hint="Indented and readable, at the cost of some bytes."
          />
        </div>
      </fieldset>
    </div>
  );
}
