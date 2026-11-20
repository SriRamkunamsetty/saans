"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { ClientError, requestAssessment } from "@/lib/client/api";
import type { AssessResponse } from "@/lib/domain/api";
import { DEFAULT_PROFILE } from "@/lib/domain/profile";
import type { Language, Profile } from "@/lib/domain/profile";
import { LocationPicker } from "./LocationPicker";
import type { SelectedLocation } from "./LocationPicker";
import { ProfileForm } from "./ProfileForm";
import { Results } from "./Results";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; data: AssessResponse };

export function AssistantApp(): ReactElement {
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [language, setLanguage] = useState<Language>("en");
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Cancel any in-flight request when the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  // After a plan arrives, move focus to its heading so keyboard and screen-reader users land on
  // it, and scroll it to the top so sighted users see the plan rather than a sliver of it.
  // Smooth scrolling is applied by CSS only when the user has not asked for reduced motion.
  useEffect(() => {
    if (status.kind !== "success") return;
    const heading = headingRef.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "start" });
  }, [status]);

  async function submit(): Promise<void> {
    if (!location) {
      setStatus({ kind: "error", message: "Choose your location first (step 1)." });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "loading" });
    try {
      const trimmed = question.trim();
      const data = await requestAssessment(
        { location, profile, language, ...(trimmed ? { question: trimmed } : {}) },
        controller.signal,
      );
      setStatus({ kind: "success", data });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus({
        kind: "error",
        message:
          error instanceof ClientError ? error.message : "Something went wrong. Please try again.",
      });
    }
  }

  const announcement =
    status.kind === "loading"
      ? "Building your plan…"
      : status.kind === "success"
        ? `Plan ready. Air quality index ${status.data.plan.aqi}, ${status.data.plan.bandLabel}.`
        : "";

  return (
    <>
      <LocationPicker selected={location} onSelect={setLocation} />
      <ProfileForm
        profile={profile}
        onProfileChange={setProfile}
        language={language}
        onLanguageChange={setLanguage}
        question={question}
        onQuestionChange={setQuestion}
        onSubmit={() => void submit()}
        busy={status.kind === "loading"}
        error={status.kind === "error" ? status.message : null}
      />
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {status.kind === "success" ? (
        <Results ref={headingRef} data={status.data} language={language} />
      ) : null}
    </>
  );
}
