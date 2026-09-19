import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command.tsx";
import { COUNTRIES } from "@/lib/countries.ts";

type CountryPickerProps = {
  /** Currently selected country name (empty string when none). */
  value: string;
  /** Called with the chosen country name. */
  onChange: (country: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Searchable dropdown for selecting a country from a canonical list.
 * Prevents inconsistent free-text spellings across customer/vendor records.
 */
export default function CountryPicker({
  value,
  onChange,
  placeholder = "Select country",
  className,
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal cursor-pointer",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search countries..." />
          <CommandList>
            <CommandEmpty>
              <div className="px-3 py-2 text-sm text-muted-foreground">No country found.</div>
            </CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country}
                  value={country}
                  onSelect={() => {
                    // Toggle off if the same country is re-selected.
                    onChange(country === value ? "" : country);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === country ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{country}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
