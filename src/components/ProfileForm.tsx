"use client";

import type { FormEvent, ReactElement } from "react";
import { LANGUAGES, LANGUAGE_NAMES } from "@/lib/domain/profile";
import type { Language, Profile, VulnerableMembers } from "@/lib/domain/profile";
import { MAX_QUESTION_LENGTH } from "@/lib/domain/schemas";
import { Field } from "./Field";
import {
  AIR_CLEANER_OPTIONS,
  COMMUTE_OPTIONS,
  COOKING_OPTIONS,
  EXERCISE_OPTIONS,
  HEATING_OPTIONS,
} from "./options";
import type { Option } from "./options";

interface ProfileFormProps {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  question: string;
  onQuestionChange: (question: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}

const MEMBER_LABELS: Record<keyof VulnerableMembers, string> = {
  children: "Children under 12",
  olderAdults: "Adults over 65",
  pregnancy: "Someone who is pregnant",
  heartOrLung: "Someone with asthma, COPD or a heart condition",
};

function SelectField<V extends string>(props: {
  label: string;
  hint?: string;
  value: V;
  options: readonly Option<V>[];
  onChange: (value: V) => void;
}): ReactElement {
  const { label, hint, value, options, onChange } = props;
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {({ inputId, describedBy }) => (
        <select
          id={inputId}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value as V)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function ProfileForm(props: ProfileFormProps): ReactElement {
  const { profile, onProfileChange, busy, error } = props;
  const set = <K extends keyof Profile>(key: K, value: Profile[K]): void =>
    onProfileChange({ ...profile, [key]: value });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onSubmit();
  }

  return (
    <form onSubmit={submit} className="card" aria-labelledby="profile-heading" noValidate>
      <h2 id="profile-heading">2. Tell us about your household</h2>
      <p className="hint">Answers stay on this request only. Nothing is saved.</p>

      <fieldset>
        <legend>Who lives with you?</legend>
        <p className="hint">Tick any that apply. We make the advice one step more cautious.</p>
        {(Object.keys(MEMBER_LABELS) as (keyof VulnerableMembers)[]).map((key) => {
          const id = `member-${key}`;
          return (
            <div key={key} className="choice">
              <input
                type="checkbox"
                id={id}
                checked={profile.vulnerable[key]}
                onChange={(e) =>
                  set("vulnerable", { ...profile.vulnerable, [key]: e.target.checked })
                }
              />
              <label htmlFor={id}>{MEMBER_LABELS[key]}</label>
            </div>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Your daily routine</legend>
        <SelectField
          label="How do you usually get to work or school?"
          value={profile.commute}
          options={COMMUTE_OPTIONS}
          onChange={(v) => set("commute", v)}
        />
        <Field label="One-way distance (km)">
          {({ inputId }) => (
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              max={150}
              step={1}
              disabled={profile.commute === "work-from-home"}
              value={profile.commuteKm}
              onChange={(e) => {
                const n = Number(e.target.value);
                set("commuteKm", Number.isFinite(n) ? Math.min(150, Math.max(0, n)) : 0);
              }}
            />
          )}
        </Field>
        <SelectField
          label="How often do you exercise outdoors?"
          value={profile.outdoorExercise}
          options={EXERCISE_OPTIONS}
          onChange={(v) => set("outdoorExercise", v)}
        />
      </fieldset>

      <fieldset>
        <legend>Your home</legend>
        <SelectField
          label="What do you cook with?"
          value={profile.cooking}
          options={COOKING_OPTIONS}
          onChange={(v) => set("cooking", v)}
        />
        <SelectField
          label="How do you keep warm in winter?"
          value={profile.heating}
          options={HEATING_OPTIONS}
          onChange={(v) => set("heating", v)}
        />
        <SelectField
          label="Do you have an air purifier?"
          value={profile.airCleaner}
          options={AIR_CLEANER_OPTIONS}
          onChange={(v) => set("airCleaner", v)}
        />
      </fieldset>

      <fieldset>
        <legend>Optional extras</legend>
        <Field
          label="Language for the summary"
          hint="Needs the AI service. The action list is in English."
        >
          {({ inputId, describedBy }) => (
            <select
              id={inputId}
              aria-describedby={describedBy}
              value={props.language}
              onChange={(e) => props.onLanguageChange(e.target.value as Language)}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Ask a question about your air today"
          hint={`For example: Can my child play cricket this evening? Up to ${MAX_QUESTION_LENGTH} characters.`}
        >
          {({ inputId, describedBy }) => (
            <textarea
              id={inputId}
              rows={3}
              maxLength={MAX_QUESTION_LENGTH}
              aria-describedby={describedBy}
              value={props.question}
              onChange={(e) => props.onQuestionChange(e.target.value)}
            />
          )}
        </Field>
      </fieldset>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      <button type="submit" className="button primary" disabled={busy} aria-busy={busy}>
        {busy ? "Building your plan…" : "Get my plan"}
      </button>
    </form>
  );
}
