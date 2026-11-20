import { useId } from "react";
import type { ReactElement, ReactNode } from "react";

interface FieldProps {
  label: string;
  hint?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/** Wires a visible label and optional hint to its control, so every input is announced properly. */
export function Field({ label, hint, children }: FieldProps): ReactElement {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hint ? (
        <p id={hintId} className="hint">
          {hint}
        </p>
      ) : null}
      {children({ inputId, describedBy: hint ? hintId : undefined })}
    </div>
  );
}
