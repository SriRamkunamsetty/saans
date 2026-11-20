// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AqiGauge } from "@/components/AqiGauge";
import { AssistantApp } from "@/components/AssistantApp";
import { Results } from "@/components/Results";
import HomePage from "@/app/page";
import { jsonResponse, makeAssessResponse } from "./fixtures";

const places = [
  { id: "1", name: "Delhi", region: "Delhi", country: "India", lat: 28.61, lon: 77.21 },
  {
    id: "2",
    name: "Delhi",
    region: "Louisiana",
    country: "United States",
    lat: 32.46,
    lon: -91.49,
  },
];

/** Routes the two API calls to canned responses and records what was sent. */
function mockApi(assess: () => Response = () => jsonResponse(makeAssessResponse())) {
  const fn = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode")) return jsonResponse({ results: places });
    if (url === "/api/assess") return assess();
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function pickPlace(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("City or area"), "Delhi");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("radio", { name: "Delhi, Delhi, India" }));
}

const expectNoViolations = async (container: Element) => {
  const results = await axe(container);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
};

afterEach(() => vi.unstubAllGlobals());

describe("page shell", () => {
  it("has a skip link, one h1, landmarks and no accessibility violations", async () => {
    mockApi();
    const { container } = render(<HomePage />);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main",
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("search")).toBeInTheDocument();
    await expectNoViolations(container);
  });
});

describe("AssistantApp", () => {
  it("gives every form control an accessible name", () => {
    mockApi();
    render(<AssistantApp />);
    for (const control of [
      ...screen.getAllByRole("combobox"),
      ...screen.getAllByRole("checkbox"),
      screen.getByRole("textbox", { name: /question/i }),
      screen.getByRole("spinbutton"),
    ]) {
      expect(control).toHaveAccessibleName();
    }
    expect(screen.getAllByRole("group").length).toBeGreaterThanOrEqual(4); // fieldsets with legends
  });

  it("completes the whole flow by keyboard-friendly controls and lands focus on the results", async () => {
    const fn = mockApi();
    const user = userEvent.setup();
    const { container } = render(<AssistantApp />);

    await pickPlace(user);
    expect(screen.getByText(/Selected:/).parentElement).toHaveTextContent("Delhi, Delhi, India");

    await user.click(screen.getByRole("checkbox", { name: "Children under 12" }));
    await user.selectOptions(
      screen.getByLabelText("How do you usually get to work or school?"),
      "car",
    );
    await user.selectOptions(screen.getByLabelText("Language for the summary"), "hi");
    await user.type(screen.getByLabelText(/Ask a question/), "Can my child play outside?");
    await user.click(screen.getByRole("button", { name: "Get my plan" }));

    const heading = await screen.findByRole("heading", { name: "Your air today in Delhi, India" });
    await waitFor(() => expect(heading).toHaveFocus());

    // The request carried the household profile, language and question — and nothing else.
    const body = JSON.parse(fn.mock.calls.find(([u]) => u === "/api/assess")![1]!.body as string);
    expect(body).toEqual({
      location: { name: "Delhi, Delhi, India", lat: 28.61, lon: 77.21 },
      profile: expect.objectContaining({
        commute: "car",
        vulnerable: expect.objectContaining({ children: true }),
      }),
      language: "hi",
      question: "Can my child play outside?",
    });

    await expectNoViolations(container);
  });

  it("tells screen-reader users when the plan is ready", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AssistantApp />);
    await pickPlace(user);
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    await screen.findByRole("heading", { name: /Your air today/ });
    const live = document.querySelector('[aria-live="polite"].sr-only')!;
    expect(live).toHaveTextContent("Plan ready. Air quality index 187, Unhealthy.");
  });

  it("asks for a location before submitting, as an alert", async () => {
    const fn = mockApi();
    const user = userEvent.setup();
    render(<AssistantApp />);
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose your location first");
    expect(fn).not.toHaveBeenCalled();
  });

  it("shows the server's message when planning fails, and recovers on retry", async () => {
    let attempts = 0;
    mockApi(() =>
      ++attempts === 1
        ? jsonResponse(
            {
              error: {
                code: "upstream_timeout",
                message: "The data service took too long to respond.",
              },
            },
            504,
          )
        : jsonResponse(makeAssessResponse()),
    );
    const user = userEvent.setup();
    render(<AssistantApp />);
    await pickPlace(user);
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The data service took too long to respond.",
    );
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    expect(await screen.findByRole("heading", { name: /Your air today/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button and sets aria-busy while loading", async () => {
    let release: (r: Response) => void = () => undefined;
    const fn = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith("/api/geocode")
        ? jsonResponse({ results: places })
        : new Promise<Response>((resolve) => {
            release = resolve;
          }),
    );
    vi.stubGlobal("fetch", fn);
    const user = userEvent.setup();
    render(<AssistantApp />);
    await pickPlace(user);
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    const busy = await screen.findByRole("button", { name: "Building your plan…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    release(jsonResponse(makeAssessResponse()));
    await screen.findByRole("heading", { name: /Your air today/ });
  });

  it("disables the distance field for people who work from home", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AssistantApp />);
    await user.selectOptions(
      screen.getByLabelText("How do you usually get to work or school?"),
      "work-from-home",
    );
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });

  it("keeps the distance within sensible bounds", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<AssistantApp />);
    const distance = screen.getByRole("spinbutton");
    await user.clear(distance);
    await user.type(distance, "9999");
    expect(distance).toHaveValue(150);
  });
});

describe("LocationPicker", () => {
  it("explains when no places match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [] })),
    );
    const user = userEvent.setup();
    render(<AssistantApp />);
    await user.type(screen.getByLabelText("City or area"), "Zzzzzz");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/No places found/)).toBeInTheDocument();
  });

  it("reports search errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const user = userEvent.setup();
    render(<AssistantApp />);
    await user.type(screen.getByLabelText("City or area"), "Delhi");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/Could not reach the service/)).toBeInTheDocument();
  });

  it("uses the browser location when permitted", async () => {
    mockApi();
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 15.5, longitude: 80.05 } } as GeolocationPosition),
      },
    });
    const user = userEvent.setup();
    render(<AssistantApp />);
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText("Your current location")).toBeInTheDocument();
  });

  it("falls back gracefully when location is denied or unsupported", async () => {
    mockApi();
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
          fail({} as GeolocationPositionError),
      },
    });
    const user = userEvent.setup();
    const { unmount } = render(<AssistantApp />);
    await user.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText(/couldn't get your location/)).toBeInTheDocument();
    unmount();

    vi.stubGlobal("navigator", {});
    render(<AssistantApp />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText(/can't share its location/)).toBeInTheDocument();
  });
});

describe("Results", () => {
  const renderResults = (data = makeAssessResponse(), language: "en" | "hi" | "te" = "en") =>
    render(<Results data={data} language={language} />);

  it("groups actions under headings and explains each one's direct impact", async () => {
    const { container } = renderResults();
    for (const name of [
      "Daily routine",
      "Indoor air",
      "Health",
      "Sustainable alternatives",
      "Community",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Direct impact:").length).toBeGreaterThan(5);
    expect(screen.getAllByText("How we worked this out").length).toBeGreaterThan(5);
    await expectNoViolations(container);
  });

  it("states the reading with a non-colour-only gauge", () => {
    renderResults();
    expect(
      screen.getByRole("img", { name: "US air quality index 187, Unhealthy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unhealthy", { selector: "figcaption" })).toBeInTheDocument();
    expect(screen.getByText(/9\.5× the WHO 24-hour guideline/)).toBeInTheDocument();
  });

  it("highlights the cleanest hour and the cautious adjustment when they apply", () => {
    renderResults(
      makeAssessResponse({
        profile: {
          vulnerable: { children: true, olderAdults: false, pregnancy: false, heartOrLung: false },
        },
      }),
    );
    expect(screen.getByText(/Cleanest hour today:/)).toHaveTextContent("1 pm");
    expect(screen.getByText(/one step more cautious/)).toBeInTheDocument();
  });

  it("omits optional blocks when there is nothing to say", () => {
    renderResults(makeAssessResponse({ air: { pm25: null, pm10: null, no2: null, o3: null } }));
    expect(screen.queryByText(/Cleanest hour today/)).not.toBeInTheDocument();
    expect(screen.queryByText(/WHO 24-hour/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^n\/a µg\/m³/)).toHaveLength(4);
  });

  it("labels AI text, marks its language, and shows answers and notices", () => {
    renderResults(
      makeAssessResponse({
        narrative: { source: "gemini", summary: "सांस लें", answer: "घर में रहें", notice: "Heads up." },
      }),
      "hi",
    );
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("सांस लें")).toHaveAttribute("lang", "hi");
    expect(screen.getByText("घर में रहें")).toHaveAttribute("lang", "hi");
    expect(screen.getByText("Heads up.")).toBeInTheDocument();
  });

  it("marks rule-based text as English regardless of the chosen language", () => {
    renderResults(makeAssessResponse(), "te");
    expect(screen.getByText("Rule-based")).toBeInTheDocument();
    expect(screen.getByText(/US AQI 187/)).toHaveAttribute("lang", "en");
  });

  it("shows emissions metrics for commuters and attributes the data", () => {
    renderResults(makeAssessResponse({ profile: { commute: "car", commuteKm: 10 } }));
    const card = screen
      .getByText("Swap some car trips for the metro, a bus or a shared ride")
      .closest("li")!;
    expect(within(card).getAllByText(/20 kg/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/CAMS ENSEMBLE/)).toBeInTheDocument();
    expect(screen.getAllByText(/not medical advice/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders a calm all-clear for good air", async () => {
    const { container } = renderResults(makeAssessResponse({ air: { usAqi: 30, pm25: 6 } }));
    expect(screen.getByText(/Outdoors: fine for most people/)).toBeInTheDocument();
    await expectNoViolations(container);
  });
});

describe("AqiGauge", () => {
  it("clamps out-of-range values so the arc never overflows", () => {
    const { container } = render(<AqiGauge aqi={999} band="hazardous" label="Hazardous" />);
    expect(container.querySelector(".gauge-value")).toHaveAttribute(
      "stroke-dasharray",
      "100.00 100",
    );
    const { container: low } = render(<AqiGauge aqi={-5} band="good" label="Good" />);
    expect(low.querySelector(".gauge-value")).toHaveAttribute("stroke-dasharray", "0.00 100");
  });
});

describe("ProfileForm selects", () => {
  it("updates every lifestyle option and sends it", async () => {
    const fn = mockApi();
    const user = userEvent.setup();
    render(<AssistantApp />);
    await pickPlace(user);
    await user.selectOptions(screen.getByLabelText("How often do you exercise outdoors?"), "daily");
    await user.selectOptions(screen.getByLabelText("What do you cook with?"), "biomass");
    await user.selectOptions(
      screen.getByLabelText("How do you keep warm in winter?"),
      "biomass-or-coal",
    );
    await user.selectOptions(screen.getByLabelText("Do you have an air purifier?"), "hepa");
    await user.click(screen.getByRole("button", { name: "Get my plan" }));
    await screen.findByRole("heading", { name: /Your air today/ });
    const body = JSON.parse(fn.mock.calls.find(([u]) => u === "/api/assess")![1]!.body as string);
    expect(body.profile).toMatchObject({
      outdoorExercise: "daily",
      cooking: "biomass",
      heating: "biomass-or-coal",
      airCleaner: "hepa",
    });
  });
});
