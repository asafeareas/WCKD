import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { mutate, useSubmitting } from "../lib/store";
import { useCategories } from "../hooks/useCategories";
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryBadge, CategoryIcon } from "../components/Icon";
import { confirm, Modal } from "../components/Modal";
import { Button, Card, CardHeader, ErrorState, Field, IconButton, Input, PageHeader, Select, Spinner, cx } from "../components/ui";
import type { Category, Kind } from "../types";

export default function Categories() {
  const { byKind, loading, error, data } = useCategories();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState<Kind | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  async function remove(c: Category) {
    if (c.transactionCount + c.linkCount > 0) {
      setDeleting(c);
      return;
    }
    const yes = await confirm({ title: "Excluir categoria?", message: `A categoria "${c.name}" não está em uso e será excluída.` });
    if (yes) await mutate(() => api.deleteCategory(c.id, null), "Categoria excluída.");
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Categorias" subtitle="Organize suas receitas e despesas. Categorias de receita e despesa são separadas." />
      {error && <ErrorState message={error} />}
      {!data && loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {(["expense", "income"] as Kind[]).map((kind) => (
            <Card key={kind}>
              <CardHeader
                title={kind === "expense" ? "Despesas" : "Receitas"}
                subtitle={`${byKind[kind].length} categorias`}
                action={
                  <Button size="sm" icon={Plus} onClick={() => setCreating(kind)}>
                    Nova
                  </Button>
                }
              />
              <ul className="mt-2 pb-2">
                {byKind[kind].map((c) => (
                  <li key={c.id} className="group flex items-center gap-3 px-5 py-2 hover:bg-surface-2">
                    <CategoryBadge icon={c.icon} color={c.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{c.name}</p>
                      <p className="text-xs text-subtle">
                        {c.transactionCount === 0
                          ? "Sem movimentações"
                          : `${c.transactionCount} ${c.transactionCount === 1 ? "movimentação" : "movimentações"}`}
                        {c.linkCount > 0 && ` · ${c.linkCount} ${c.linkCount === 1 ? "vínculo" : "vínculos"}`}
                      </p>
                    </div>
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconButton icon={Pencil} label="Editar" onClick={() => setEditing(c)} />
                      <IconButton icon={Trash2} label="Excluir" tone="danger" onClick={() => remove(c)} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <CategoryForm
        open={!!editing || !!creating}
        category={editing}
        kind={editing?.kind ?? creating ?? "expense"}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
      />
      <ReassignDialog category={deleting} options={deleting ? byKind[deleting.kind].filter((c) => c.id !== deleting.id) : []} onClose={() => setDeleting(null)} />
    </div>
  );
}

function CategoryForm({ open, category, kind, onClose }: { open: boolean; category: Category | null; kind: Kind; onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState("tag");
  const [err, setErr] = useState<string | null>(null);
  const [busy, run] = useSubmitting();

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setColor(category?.color ?? CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]);
    setIcon(category?.icon ?? "tag");
    setErr(null);
  }, [open, category]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Informe o nome da categoria.");
    const input = { name: name.trim(), kind, color, icon };
    const ok = await run(() =>
      mutate(
        () => (category ? api.updateCategory(category.id, input) : api.createCategory(input)),
        category ? "Categoria atualizada." : "Categoria criada.",
      ),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Editar categoria" : `Nova categoria de ${kind === "income" ? "receita" : "despesa"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="cat-form" loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="flex items-end gap-3">
          <CategoryBadge icon={icon} color={color} size={36} />
          <div className="flex-1">
            <Field label="Nome" htmlFor="cat-name" error={err}>
              <Input id="cat-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err || undefined} />
            </Field>
          </div>
        </div>
        <Field label="Cor">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cx("h-7 w-7 wobbly border-2 border-ink transition-transform", color === c && "scale-110 -rotate-6 shadow-[2px_2px_0_var(--ink)]")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        <Field label="Ícone">
          <div className="grid grid-cols-9 gap-1">
            {Object.keys(CATEGORY_ICONS).map((key) => (
              <button
                key={key}
                type="button"
                aria-label={`Ícone ${key}`}
                onClick={() => setIcon(key)}
                className={cx(
                  "flex h-8 items-center justify-center wobbly transition-colors",
                  icon === key ? "bg-surface-3 text-fg ring-1 ring-line-strong" : "text-subtle hover:bg-surface-2 hover:text-fg",
                )}
              >
                <CategoryIcon name={key} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

function ReassignDialog({ category, options, onClose }: { category: Category | null; options: Category[]; onClose: () => void }) {
  const [target, setTarget] = useState<number | "">("");
  const [busy, run] = useSubmitting();
  useEffect(() => setTarget(""), [category]);

  async function confirmDelete() {
    if (!category || target === "") return;
    const ok = await run(() => mutate(() => api.deleteCategory(category.id, target).then(() => true), "Categoria excluída e registros reclassificados."));
    if (ok) onClose();
  }

  return (
    <Modal
      open={!!category}
      onClose={onClose}
      width="sm"
      title="Categoria em uso"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={target === ""} loading={busy}>
            Reclassificar e excluir
          </Button>
        </>
      }
    >
      {category && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-muted">
            <strong className="text-fg">{category.name}</strong> possui {category.transactionCount}{" "}
            {category.transactionCount === 1 ? "movimentação" : "movimentações"}
            {category.linkCount > 0 && ` e ${category.linkCount} conta(s) recorrente(s) ou parcelamento(s)`}. Para não perder nenhum dado,
            escolha para qual categoria esses registros serão movidos. Orçamentos serão somados aos da categoria de destino.
          </p>
          <Field label="Mover registros para">
            <Select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")} data-autofocus>
              <option value="">Selecione uma categoria</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
