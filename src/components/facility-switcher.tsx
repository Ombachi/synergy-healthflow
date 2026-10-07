import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFacility } from "@/components/facility-context";
import type { Facility } from "@/lib/facilities";

export function FacilitySwitcher() {
  const { activeFacility, availableFacilities, setActiveFacility, isMultiFacilityAdmin } = useFacility();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Facility | null>(null);

  if (!isMultiFacilityAdmin) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        {activeFacility.name}
      </span>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-[260px] gap-1.5" aria-label="Switch facility">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="truncate">{activeFacility.name}</span>
            <span className="rounded bg-muted px-1 text-[10px] font-mono">{activeFacility.code}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <Command>
            <CommandInput placeholder="Search facility…" />
            <CommandList>
              <CommandEmpty>No facility found.</CommandEmpty>
              <CommandGroup heading="Facilities">
                {availableFacilities.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`${f.name} ${f.code}`}
                    onSelect={() => { setOpen(false); if (f.id !== activeFacility.id) setPending(f); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${f.id === activeFacility.id ? "opacity-100" : "opacity-0"}`} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.code} · {f.facility_type}{f.is_active ? "" : " · inactive"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pending?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Lists, queues and new records will use this facility. Open forms may lose unsaved changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) setActiveFacility(pending.id); setPending(null); }}>
              Switch facility
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
