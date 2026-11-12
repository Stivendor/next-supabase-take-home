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
 * Selección múltiple con el patrón "menu button" de WAI-ARIA (Radix): se cierra con clic
 * fuera o Escape, devuelve el foco al botón, navega con flechas y busca al teclear.
 * Los valores elegidos viajan en inputs hidden para que el <form> GET los envíe.
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
  // En el orden de las opciones, para que la URL sea estable.
  const values = options.filter((option) => selected.includes(option));
  const summary =
    values.length === 0 ? "Any" : values.length === 1 ? values[0] : `${values.length} selected`;

  return (
    <div>
      {values.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {/* modal={false}: el clic fuera cierra la lista y además llega a su destino (p. ej. otro filtro). */}
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
          // Radix bloquea Tab dentro del menú; WAI-ARIA pide que Tab lo cierre. El foco vuelve al botón.
          onKeyDown={(event) => event.key === "Tab" && setOpen(false)}
        >
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={values.includes(option)}
              onCheckedChange={(checked) =>
                setSelected((prev) => (checked ? [...prev, option] : prev.filter((v) => v !== option)))
              }
              // Mantiene la lista abierta para marcar varias opciones seguidas.
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
