import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrudPage } from "@/components/crud-page";
import { useAuth } from "@/hooks/use-auth";
import { ReorderAutomation } from "@/components/reorder-automation";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: Inventory,
});

interface Item {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  reorder_threshold: number;
  supplier: string | null;
}

function Inventory() {
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin");

  return (
    <div className="space-y-6">
    <ReorderAutomation />
    <CrudPage<Item>
      title="Inventory"
      description="Stock, reorder thresholds, and suppliers."
      table="inventory_items"
      canWrite={canWrite}
      defaultForm={{ name: "", quantity: 0, reorder_threshold: 10 }}
      columns={[
        { key: "name", label: "Item" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        {
          key: "quantity",
          label: "Qty",
          render: (r) => (
            <span
              className={
                r.quantity <= r.reorder_threshold ? "font-semibold text-rose-600" : ""
              }
            >
              {r.quantity}
            </span>
          ),
        },
        { key: "reorder_threshold", label: "Reorder at" },
        { key: "supplier", label: "Supplier" },
      ]}
      renderForm={(form, setForm) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Item name</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>SKU</Label>
              <Input
                value={form.sku ?? ""}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category ?? ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input
                value={form.supplier ?? ""}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={form.quantity ?? 0}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Reorder threshold</Label>
              <Input
                type="number"
                value={form.reorder_threshold ?? 10}
                onChange={(e) =>
                  setForm({ ...form, reorder_threshold: Number(e.target.value) })
                }
              />
            </div>
          </div>
        </>
      )}
    />
    </div>
  );
}
