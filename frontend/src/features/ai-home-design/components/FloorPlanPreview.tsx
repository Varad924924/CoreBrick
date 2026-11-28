
import { useState } from "react";
import type { FloorPlanConcept, ConceptRoom } from "../utils/generateFloorPlanConcept";

interface Props {
  concept: FloorPlanConcept;
}

const zoneStyle: Record<ConceptRoom["zone"], string> = {
  public: "border-sky-300 bg-sky-50 text-sky-950",
  private: "border-violet-300 bg-violet-50 text-violet-950",
  service: "border-amber-300 bg-amber-50 text-amber-950",
  circulation: "border-emerald-300 bg-emerald-50 text-emerald-950",
};

export default function FloorPlanPreview({ concept }: Props) {
  const [activeFloor, setActiveFloor] = useState(0);
  const floor = concept.floors[activeFloor];

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-live="polite">
      <div className="bg-[#173638] px-5 py-6 text-white sm:px-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-200">Preliminary 2D concept</p>
        <h2 className="mt-2 text-2xl font-semibold">{concept.title}</h2>
        <p className="mt-2 text-sm text-white/75">
          {concept.plotDimensions} · {concept.plotAreaSqFt.toLocaleString("en-IN", { maximumFractionDigits: 1 })} sq. ft. · {concept.facing}-facing
        </p>
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select floor">
          {concept.floors.map((item, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeFloor === index}
              key={item.title}
              onClick={() => setActiveFloor(index)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeFloor === index ? "bg-[#173638] text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-[#f8faf8] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">{floor.title} layout zones</h3>
              <p className="mt-1 text-xs text-slate-500">{floor.subtitle}</p>
            </div>
            <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
              ENTRY: {concept.facing}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {floor.rooms.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className={`flex min-h-24 flex-col justify-between rounded-xl border-2 p-3 ${zoneStyle[item.zone]}`}
              >
                <span className="text-sm font-bold">{item.name}</span>
                <span className="mt-2 text-[11px] leading-4 opacity-75">{item.note}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Schematic room grouping only. Blocks are not to scale and do not indicate exact orientation or dimensions.
          </p>
        </div>

        <div className="mt-5">
          <h3 className="font-semibold text-slate-900">Concept legend</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-sky-950">Public spaces</span>
            <span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-violet-950">Private spaces</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-950">Service spaces</span>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-950">Circulation / outdoor</span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-950">Important design checks</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">
            {concept.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
