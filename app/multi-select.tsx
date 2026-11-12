"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Multi-select using the WAI-ARIA "menu button" pattern (Radix): closes on outside click
 * or Escape, returns focus to the button, navigates with arrow keys and supports typeahead.
 * Selected values travel in hidden inputs so the GET <form> submits them.
 */
export function MultiSelect({
  name,
  label,
  options,
  defaultSelected,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultSelected: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>(defaultSelected);
  // In option order, so the URL is stable.
  const values = options.filter((option) => selected.includes(option));
  const summary =
    values.length === 0 ? "Any" : values.length === 1 ? values[0] : `${values.length} selected`;

  return (
    <div>
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {/* modal={false}: an outside click closes the list and still reaches its target (e.g. another filter). */}
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between gap-2 px-3 font-normal">
            <span className="font-medium">{label}</span>
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <span className="truncate">{summary}</span>
              <ChevronDown aria-hidden className="size-4 shrink-0 opacity-60" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)]"
          // Radix blocks Tab inside the menu; WAI-ARIA says Tab should close it. Focus returns to the button.
          onKeyDown={(event) => event.key === "Tab" && setOpen(false)}
        >
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={values.includes(option)}
              onCheckedChange={(checked) =>
                setSelected((prev) => (checked ? [...prev, option] : prev.filter((v) => v !== option)))
              }
              // Keeps the list open so several options can be checked in a row.
              onSelect={(event) => event.preventDefault()}
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
