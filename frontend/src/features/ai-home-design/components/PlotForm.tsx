import type { ChangeEvent, FormEvent } from "react";
import type { HomeDesignRequirements } from "../types/design.types";
import { calculatePlotArea, formatArea } from "../utils/areaCalculator";

interface Props {
  value: HomeDesignRequirements;
  onChange: (next: HomeDesignRequirements) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function PlotForm({ value, onChange, onSubmit }: Props) {
  const area = calculatePlotArea(value.plotLength, value.plotWidth, value.unit);
  const update = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const next = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value;
    onChange({ ...value, [el.name]: next });
  };
  const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/10";

  return <form className="space-y-8" onSubmit={onSubmit}>
    <section>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-700">01 · Your plot</p>
      <h2 className="mt-2 text-xl font-semibold">Tell us about your land</h2>
      <p className="mt-1 text-sm text-slate-500">Enter the plot dimensions and orientation to begin.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Plot shape
          <select className={field} name="plotShape" value={value.plotShape} onChange={update}>
            <option value="rectangle">Rectangle</option><option value="square">Square</option><option value="irregular">Irregular / Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">Plot facing
          <select className={field} name="facing" value={value.facing} onChange={update}>
            {["North","South","East","West","North-East","North-West","South-East","South-West"].map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Plot length
          <input className={field} required min="0.1" step="any" type="number" name="plotLength" value={value.plotLength} onChange={update} placeholder="e.g. 40" />
        </label>
        <label className="text-sm font-medium">Plot width
          <input className={field} required min="0.1" step="any" type="number" name="plotWidth" value={value.plotWidth} onChange={update} placeholder="e.g. 30" />
        </label>
        <label className="text-sm font-medium">Measurement unit
          <select className={field} name="unit" value={value.unit} onChange={update}><option value="ft">Feet</option><option value="m">Metres</option></select>
        </label>
        <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-800">Calculated plot area</span>
          <p className="mt-1 text-lg font-bold text-teal-950">{formatArea(area)}</p>
        </div>
      </div>
      {value.plotShape === "irregular" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">For an irregular plot, length × width is only an approximate rectangular area. A site survey is required for accurate planning.</p>}
    </section>

    <section className="border-t border-slate-100 pt-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-700">02 · Your home</p>
      <h2 className="mt-2 text-xl font-semibold">What would you like to build?</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Home configuration
          <select className={field} name="configuration" value={value.configuration} onChange={update}>{["1 BHK","2 BHK","3 BHK","4 BHK","5+ BHK"].map(x => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="text-sm font-medium">Number of floors
          <select className={field} name="floors" value={value.floors} onChange={update}><option value="1">Ground floor only</option><option value="2">Ground + 1</option><option value="3">Ground + 2</option><option value="4">Ground + 3</option></select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Approximate construction budget
          <select className={field} required name="budget" value={value.budget} onChange={update}>
            <option value="">Select your budget</option><option>Below ₹20 lakh</option><option>₹20–30 lakh</option><option>₹30–50 lakh</option><option>₹50–75 lakh</option><option>₹75 lakh–₹1 crore</option><option>Above ₹1 crore</option><option>Not decided yet</option>
          </select>
        </label>
      </div>
    </section>

    <section className="border-t border-slate-100 pt-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-700">03 · Preferences</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm"><input type="checkbox" className="accent-teal-800" name="parking" checked={value.parking} onChange={update} /> Include vehicle parking</label>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm"><input type="checkbox" className="accent-teal-800" name="vastuPreference" checked={value.vastuPreference} onChange={update} /> Consider Vastu preferences</label>
      </div>
      <label className="mt-4 block text-sm font-medium">Additional requirements
        <textarea className={field} rows={4} name="additionalRequirements" value={value.additionalRequirements} onChange={update} placeholder="e.g. parents' bedroom on ground floor, home office, open kitchen, garden..." />
      </label>
    </section>
    <div className="border-t border-slate-100 pt-6 sm:flex sm:items-center sm:justify-between sm:gap-5">
      <p className="text-xs leading-5 text-slate-500">This creates an initial design brief. Final plans require site measurements and professional review.</p>
      <button className="mt-4 rounded-full bg-[#173638] px-7 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-[#24504e] sm:mt-0" type="submit">Review my requirements →</button>
    </div>
  </form>;
}

