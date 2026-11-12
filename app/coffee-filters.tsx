import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ENUM_FILTERS,
  ENUM_FILTER_KEYS,
  RANGE_FILTERS,
  RANGE_FILTER_KEYS,
  type Filters,
  type Range,
} from "@/lib/coffee-health";

import { MultiSelect } from "./multi-select";

/**
 * GET form: filters end up in the URL and the server filters in Postgres.
 * next/form navigates on the client without a reload. It has no `after`/`before`, so
 * changing filters goes back to the first page.
 * ponytail: empty inputs travel as `age_min=` in the URL; the parser ignores them.
 * Stripping them would need a client component.
 */
export function CoffeeFilters({ filters, countries }: { filters: Filters; countries: string[] }) {
  return (
    <Form action="/" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MultiSelect name="country" label="Country" options={countries} defaultSelected={filters.country} />
        {ENUM_FILTER_KEYS.map((key) => (
          <MultiSelect
            key={key}
            name={key}
            label={ENUM_FILTERS[key].label}
            options={ENUM_FILTERS[key].options}
            defaultSelected={filters[key]}
          />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RANGE_FILTER_KEYS.map((key) => (
          <RangeInputs key={key} name={key} {...RANGE_FILTERS[key]} value={filters[key]} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="ghost" asChild>
          <Link href="/">Clear</Link>
        </Button>
      </div>
    </Form>
  );
}

function RangeInputs({
  name,
  label,
  step,
  value,
}: {
  name: string;
  label: string;
  step: number;
  value: Range;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          name={`${name}_min`}
          min={0}
          step={step}
          placeholder="Min"
          defaultValue={value.min}
          aria-label={`${label} minimum`}
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <Input
          type="number"
          name={`${name}_max`}
          min={0}
          step={step}
          placeholder="Max"
          defaultValue={value.max}
          aria-label={`${label} maximum`}
        />
      </div>
    </fieldset>
  );
}
