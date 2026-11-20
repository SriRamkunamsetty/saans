"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { ClientError, searchPlaces } from "@/lib/client/api";
import type { PlaceSummary } from "@/lib/domain/api";

export interface SelectedLocation {
  name: string;
  lat: number;
  lon: number;
}

interface LocationPickerProps {
  selected: SelectedLocation | null;
  onSelect: (location: SelectedLocation) => void;
}

const describePlace = (p: PlaceSummary): string =>
  [p.name, p.region, p.country].filter(Boolean).join(", ");

export function LocationPicker({ selected, onSelect }: LocationPickerProps): ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function onSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchPlaces(query.trim(), controller.signal);
      setResults(found);
      if (found.length === 0)
        setMessage("No places found. Try a nearby city or a different spelling.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof ClientError ? error.message : "Search failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation(): void {
    if (!("geolocation" in navigator)) {
      setMessage("Your browser can't share its location. Search for your city instead.");
      return;
    }
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        onSelect({
          name: "Your current location",
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setResults(null);
      },
      () => {
        setBusy(false);
        setMessage("We couldn't get your location. You can search for your city instead.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <section aria-labelledby="location-heading" className="card">
      <h2 id="location-heading">1. Where are you?</h2>

      <form role="search" onSubmit={onSearch} className="search-row">
        <div className="field grow">
          <label htmlFor="place-query">City or area</label>
          <input
            id="place-query"
            type="search"
            name="place"
            autoComplete="off"
            minLength={2}
            maxLength={80}
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      <p>
        <button type="button" className="button secondary" onClick={useMyLocation} disabled={busy}>
          Use my current location
        </button>
      </p>
      <p className="hint">
        Your location is used once to fetch air quality and is rounded to about 1 km. It is never
        stored.
      </p>

      {message ? (
        <p role="status" className="message">
          {message}
        </p>
      ) : null}

      {results && results.length > 0 ? (
        <fieldset className="choice-list">
          <legend>Choose your place</legend>
          {results.map((place) => {
            const id = `place-${place.id}`;
            return (
              <div key={place.id} className="choice">
                <input
                  type="radio"
                  name="place-choice"
                  id={id}
                  checked={selected?.lat === place.lat && selected?.lon === place.lon}
                  onChange={() =>
                    onSelect({ name: describePlace(place), lat: place.lat, lon: place.lon })
                  }
                />
                <label htmlFor={id}>{describePlace(place)}</label>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      <p aria-live="polite" className="selected">
        {selected ? (
          <>
            <strong>Selected:</strong> {selected.name}
          </>
        ) : (
          "No place selected yet."
        )}
      </p>
    </section>
  );
}
