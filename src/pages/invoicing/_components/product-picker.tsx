import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Check, ChevronsUpDown, Search } from "lucide-react";
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
import { useCurrency } from "@/hooks/use-currency.ts";

type ProductSelection = { id: string; name: string; unitPrice: number };

type ProductPickerProps = {
  /** Current description text, used to show the selected product name. */
  value: string;
  /** Called when the user picks a product from the list. */
  onSelectProduct: (product: ProductSelection) => void;
  /** Called when the user edits the free-text description. */
  onDescriptionChange: (description: string) => void;
  className?: string;
};

/**
 * Searchable Products & Services picker for invoice/order line items.
 * Lets the user either choose an existing product (auto-fills price) or
 * type a custom free-text description.
 */
export default function ProductPicker({
  value,
  onSelectProduct,
  onDescriptionChange,
  className,
}: ProductPickerProps) {
  const { fmt } = useCurrency();
  const products = useQuery(api.invoicing.listProductsForSelect);
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
          <span className="truncate">{value || "Select product or type a description"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search products & services..." />
          <CommandList>
            <CommandEmpty>
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No product found. Type a custom description below.
              </div>
            </CommandEmpty>
            <CommandGroup>
              {products?.map((p) => (
                <CommandItem
                  key={p._id}
                  value={`${p.name} ${p.sku ?? ""}`}
                  onSelect={() => {
                    onSelectProduct({ id: p._id, name: p.name, unitPrice: p.unitPrice });
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate">
                      {p.name}
                      {p.sku && <span className="ml-1 text-xs text-muted-foreground">({p.sku})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmt(p.unitPrice)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Custom description input for non-catalog items */}
            <div className="border-t p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={value}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  placeholder="Or type a custom description"
                  className="w-full rounded-md border bg-transparent py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
