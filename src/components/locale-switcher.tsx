import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  changeLocale,
  SUPPORTED_LOCALES,
  SUPPORTED_LOCALES_ARRAY,
  type SupportedLocale,
} from "@/i18n.ts";
import { cn } from "@/lib/utils.ts";
import { Check, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function LocaleSwitcher({ compact }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const currentMeta = SUPPORTED_LOCALES[i18n.language as keyof typeof SUPPORTED_LOCALES];

  const handleChangeLocale = (newLng: SupportedLocale) => {
    void changeLocale(newLng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          {!compact && <span className="text-xs">{currentMeta?.nativeName ?? "English"}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES_ARRAY.map((lng) => {
          const meta = SUPPORTED_LOCALES[lng];
          const isActive = i18n.language === lng;
          return (
            <DropdownMenuItem
              key={lng}
              onClick={() => handleChangeLocale(lng)}
              className="cursor-pointer"
            >
              <Check className={cn("mr-2 h-4 w-4", isActive ? "opacity-100" : "opacity-0")} />
              <span className="flex-1">{meta.nativeName}</span>
              <span className="text-muted-foreground ml-2 text-xs">{meta.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
