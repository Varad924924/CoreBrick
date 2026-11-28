import { useMemo, useState, type FormEvent } from "react";
import PlotForm from "../components/PlotForm";
import FloorPlanPreview from "../components/FloorPlanPreview";
import type { HomeDesignRequirements } from "../types/design.types";
import { calculatePlotArea, formatArea } from "../utils/areaCalculator";
import { generateFloorPlanConcept } from "../utils/generateFloorPlanConcept";

const initial: HomeDesignRequirements = {
  plotShape: "rectangle", plotLength: "", plotWidth: "", unit: "ft", facing: "East",
  budget: "", floors: "2", configuration: "2 BHK", parking: true,
  vastuPreference: false, additionalRequirements: "",
};

export default function AIHomeDesignPage() {
  const [requirements, setRequirements] = useState(initial);
  const [reviewReady, setReviewReady] = useState(false);
  const [conceptReady, setConceptReady] = useState(false);
  const area = useMemo(() => calculatePlotArea(requirements.plotLength, requirements.plotWidth, requirements.unit), [requirements.plotLength, requirements.plotWidth, requirements.unit]);
  const concept = useMemo(
    () => area === null ? null : generateFloorPlanConcept(requirements, area),
    [requirements, area],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (area !== null && requirements.budget) {
      setReviewReady(true);
      setConceptReady(false);
    }
  }

  function updateRequirements(next: HomeDesignRequirements) {
    setRequirements(next);
    setReviewReady(false);
    setConceptReady(false);
  }

  return <main className="min-h-screen bg-[#f5f6f2] text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="text-2xl font-black tracking-tight text-[#173638]">MHD<span className="text-orange-700">.</span></a>
        <a href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">← Back to MHD</a>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:py-14">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-orange-800">MHD · Smart home planning</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Let’s plan a home around your plot.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Share your plot details, budget and preferences. Review your brief, then create a preliminary room-layout concept.</p>
        </div>
        <PlotForm value={requirements} onChange={updateRequirements} onSubmit={submit} />

        {reviewReady && <section className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 p-5 sm:p-6" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-800">Requirement brief ready</p>
          <h2 className="mt-2 text-xl font-semibold text-teal-950">Your home-planning summary</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p>Plot area: <strong>{formatArea(area)}</strong></p><p>Facing: <strong>{requirements.facing}</strong></p>
            <p>Home: <strong>{requirements.configuration}</strong></p><p>Floors: <strong>{requirements.floors}</strong></p>
            <p>Budget: <strong>{requirements.budget}</strong></p><p>Parking: <strong>{requirements.parking ? "Required" : "Not required"}</strong></p>
            <p>Vastu: <strong>{requirements.vastuPreference ? "Preferred" : "Not specified"}</strong></p>
          </div>
          {requirements.additionalRequirements && <p className="mt-4 border-t border-teal-200 pt-4 text-sm leading-6"><strong>Additional requirements:</strong> {requirements.additionalRequirements}</p>}
          <div className="mt-5 border-t border-teal-200 pt-5">
            <button
              type="button"
              onClick={() => setConceptReady(true)}
              className="rounded-full bg-[#173638] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#24504e]"
            >
              Generate preliminary 2D concept →
            </button>
            <p className="mt-3 text-xs leading-5 text-teal-900">This first version creates a rule-based room grouping from your inputs. It is not an AI-generated, dimensioned architectural drawing.</p>
          </div>
        </section>}

        {conceptReady && concept && <FloorPlanPreview concept={concept} />}
      </section>
      <aside className="space-y-4">
        <div className="rounded-3xl bg-[#173638] p-6 text-white shadow-lg">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-200">How it works</p>
          <ol className="mt-5 space-y-5">{[
            ["01","Share plot details","Dimensions, shape and facing."],
            ["02","Set home preferences","Configuration, floors and budget."],
            ["03","Review your brief","Confirm the requirements you entered."],
            ["04","View a 2D concept","Explore a preliminary room grouping by floor."],
          ].map(([n,t,d]) => <li className="flex gap-3" key={n}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-bold text-teal-100">{n}</span><div><h3 className="text-sm font-semibold">{t}</h3><p className="mt-1 text-xs leading-5 text-white/65">{d}</p></div></li>)}</ol>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Design responsibly</h2><p className="mt-2 text-sm leading-6 text-slate-600">Area calculations are estimates. Setbacks, local development rules, road access, plot orientation and structural requirements must be checked by qualified professionals.</p></div>
      </aside>
    </div>
  </main>;
}

