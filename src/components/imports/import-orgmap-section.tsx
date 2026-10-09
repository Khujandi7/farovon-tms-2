"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { scanOrgMap, type OrgGroup, type OrgScan } from "@/app/(app)/imports/orgmap-actions";
import { safeAction } from "@/lib/imports/batch";
import { CAUSE_LABEL, buildItems, canBulkCreate, groupKey, type Choice, type Draft } from "@/lib/imports/orgmap";
import { onlyAccepted, runOrgMap, runReanalyzeAll, type MapRunResult } from "@/lib/imports/orgmap-run";
import type { OrgMapItem } from "@/app/(app)/imports/orgmap-actions";

const PAGE_SHOW = 50;
const SCAN_PAGE = 300;

type Props = {
  jobId: string;
  scan: OrgScan | null;
  setScan: (s: OrgScan | null) => void;
  /** После сохранения и повторного разбора: обновить предпросмотр применения и страницу. */
  onChanged: () => Promise<void> | void;
  busy: string | null;
  setBusy: (b: "map" | "reanalyze" | "apply" | null) => void;
  setProgress: (p: { done: number; total: number; label: string } | null) => void;
};

const causeVariant = (c: OrgGroup["cause"]) => (c === "MAPPED" || c === "RESOLVABLE" ? "success" : c === "MISSING" ? "warning" : "outline");

/**
 * Массовое сопоставление: одно значение из файла = одна строка таблицы (не сотни строк импорта).
 * Порядок: выбрать действия → «Предпросмотр» (ничего не сохраняет) → «Сохранить и перепроверить» (причина обязательна) → повторный разбор всех строк.
 */
export function ImportOrgMapSection({ jobId, scan, setScan, onChanged, busy, setBusy, setProgress }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filter, setFilter] = useState<"" | OrgGroup["cause"]>("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(PAGE_SHOW);
  const [preview, setPreview] = useState<{ items: OrgMapItem[]; result: MapRunResult } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [dlg, setDlg] = useState(false);

  const groups = useMemo(() => scan?.list ?? [], [scan]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => (!filter || g.cause === filter) && (!needle || g.srcName.toLowerCase().includes(needle) || g.scopeLabel.toLowerCase().includes(needle)));
  }, [groups, filter, q]);
  const items = useMemo(() => buildItems(groups, drafts), [groups, drafts]);
  const unmapped = groups.filter((g) => g.cause !== "MAPPED" && g.cause !== "RESOLVABLE" && !drafts[groupKey(g)]?.action).length;
  const creatable = groups.filter((g) => canBulkCreate(g) && !drafts[groupKey(g)]?.action);

  function setDraft(g: OrgGroup, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [groupKey(g)]: { ...d[groupKey(g)], action: "", ...patch } }));
    setPreview(null); setNote(undefined);
  }

  async function rescan() {
    const r = await safeAction(() => scanOrgMap({ jobId, offset: 0, limit: SCAN_PAGE }));
    if (r.ok) setScan(r.data); else setError(r.error);
  }

  async function loadMore() {
    if (!scan) return;
    const r = await safeAction(() => scanOrgMap({ jobId, offset: scan.list.length, limit: SCAN_PAGE }));
    if (!r.ok) { setError(r.error); return; }
    setScan({ ...r.data, list: [...scan.list, ...r.data.list], offset: 0 });
  }

  async function doPreview() {
    setBusy("map"); setError(undefined); setNote(undefined);
    try {
      const r = await runOrgMap(jobId, items, { dry: true });
      if (!r.ok) { setError(r.error); return; }
      setPreview({ items, result: r.result });
    } finally { setBusy(null); }
  }

  async function doSave(reason: string): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
    if (!preview) return { ok: false, error: "Сначала выполните предпросмотр." };
    const accepted = onlyAccepted(preview.items, preview.result);
    if (accepted.length === 0) return { ok: false, error: "Нет допустимых значений для сохранения." };
    setBusy("map"); setError(undefined);
    try {
      const saved = await runOrgMap(jobId, accepted, { dry: false, reason }, (done, total) => setProgress({ done, total, label: "Сохранение сопоставления" }));
      if (!saved.ok) { setError(`${saved.error} Сохранённые части не потеряны; нажмите «Предпросмотр» и «Сохранить» снова — повтор безопасен.`); await rescan(); return saved; }
      const total = scan?.rowsWithUnitIssue ?? 0;
      setBusy("reanalyze");
      const re = await runReanalyzeAll(jobId, total, (done, t) => setProgress({ done, total: Math.max(t, done), label: "Повторный разбор строк" }));
      setNote(`Сохранено значений: ${saved.result.ok}${saved.result.failed ? ` (отклонено: ${saved.result.failed})` : ""}; затронуто строк: ${saved.result.rowsAffected}. Разбор: решено ${re.totals.resolved}, осталось ${re.totals.unresolved}${re.totals.errors ? `, ошибок ${re.totals.errors}` : ""}.`);
      if (!re.ok) setError(re.error);
      setDrafts({}); setPreview(null);
      await rescan();
      await onChanged();
      return { ok: true, message: "Сопоставление сохранено, строки перепроверены." };
    } finally { setBusy(null); setProgress(null); }
  }

  async function reanalyzeOnly() {
    setBusy("reanalyze"); setError(undefined); setNote(undefined);
    try {
      const re = await runReanalyzeAll(jobId, scan?.rowsWithUnitIssue ?? 0, (done, t) => setProgress({ done, total: Math.max(t, done), label: "Повторный разбор строк" }));
      setNote(`Проверено строк: ${re.totals.processed}. Решено: ${re.totals.resolved}. Осталось: ${re.totals.unresolved}.${re.totals.errors ? ` Ошибок: ${re.totals.errors}${re.totals.firstError ? ` (${re.totals.firstError})` : ""}.` : ""}`);
      if (!re.ok) setError(re.error);
      await rescan();
      await onChanged();
    } finally { setBusy(null); setProgress(null); }
  }

  function markCreate() {
    setDrafts((d) => { const n = { ...d }; for (const g of creatable) n[groupKey(g)] = { action: "CREATE" }; return n; });
    setPreview(null);
  }

  if (!scan) return <FormAlert error="Не удалось загрузить значения оргструктуры. Обновите страницу." />;
  const needsReanalyze = groups.some((g) => g.cause === "MAPPED" || g.cause === "RESOLVABLE");

  return (
    <div className="space-y-3 rounded-lg border p-3" data-testid="orgmap-section">
      <div className="space-y-1 text-sm">
        <p className="font-medium">Шаг 1. Сопоставление оргструктуры из файла</p>
        <p className="text-muted-foreground">
          Одно значение из файла — одна строка: выбираете подразделение один раз, и оно относится ко всем строкам с этим значением в том же департаменте.
          Сопоставление действует только в этом импорте (не меняет справочник). Подразделения не создаются «по догадке», похожие названия — лишь подсказки.
        </p>
      </div>

      <div className="space-y-1 text-sm" data-testid="orgmap-summary">
        <p>
          Значений: <strong data-testid="orgmap-groups">{scan.groups}</strong>, строк с замечанием по подразделению: <strong data-testid="orgmap-rows">{scan.rowsWithUnitIssue}</strong>.
          Сопоставлено в этом импорте: {scan.mappedGroups}. Применено ранее (не затрагивается): {scan.protectedApplied}. Пропущено вашим решением: {scan.protectedSkippedByDecision}.
        </p>
        <ul className="flex flex-wrap gap-1.5" data-testid="orgmap-causes">
          {scan.byCause.map((c) => (
            <li key={c.cause}>
              <button type="button" className="rounded-md" onClick={() => { setFilter(filter === c.cause ? "" : c.cause); setShow(PAGE_SHOW); }} aria-pressed={filter === c.cause}>
                <Badge variant={filter === c.cause ? "brand" : causeVariant(c.cause)}>{CAUSE_LABEL[c.cause]}: {c.groups} зн. / {c.rows} стр.</Badge>
              </button>
            </li>
          ))}
        </ul>
        {scan.reviewBreakdown.some((b) => b.code !== "UNIT_UNKNOWN" && b.withUnitIssue > 0) && (
          <p className="text-xs text-muted-foreground" data-testid="orgmap-other-codes">
            Строки с другим кодом проверки, у которых тоже не найдено подразделение: {scan.reviewBreakdown.filter((b) => b.code !== "UNIT_UNKNOWN").map((b) => `${b.code} — ${b.withUnitIssue}`).join(", ")}.
            Подразделение у них разбирается здесь, но решение по сотруднику остаётся за вами: такие строки сами не применяются.
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="orgmap-empty">Нерешённых значений подразделений нет.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setShow(PAGE_SHOW); }} placeholder="Найти значение или департамент" aria-label="Поиск значения" className="pl-8" data-testid="orgmap-search" />
            </div>
            {creatable.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={markCreate} disabled={busy !== null} data-testid="orgmap-bulk-create">
                Отметить «создать» для отсутствующих нигде ({creatable.length})
              </Button>
            )}
          </div>

          <ul className="divide-y rounded-lg border" data-testid="orgmap-list">
            {visible.slice(0, show).map((g, idx) => {
              const key = groupKey(g);
              const d = drafts[key] ?? { action: "" as Choice };
              const allowed = g.candidates.filter((c) => c.level === g.kind);
              const canPick = g.cause !== "MAPPED" && g.cause !== "RESOLVABLE" && g.cause !== "PARENT_UNRESOLVED";
              const canCreate = canPick && g.cause !== "INACTIVE" && g.cause !== "OTHER_LEVEL" && (g.kind === "DEPARTMENT" || g.scope !== "");
              const homonym = g.cause === "OTHER_PARENT" || g.cause === "ALIAS_OTHER_PARENT";
              return (
                <li key={key} className="grid gap-2 p-3 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid={`orgmap-row-${idx}`}>
                  <div className="space-y-1">
                    <p className="font-medium break-words">{g.kind === "UNIT" ? "Отдел" : "Департамент"} «{g.srcName}»</p>
                    <p className="text-xs text-muted-foreground">
                      {g.kind === "UNIT" ? `В департаменте: ${g.scopeLabel ? `«${g.scopeLabel}»` : "не указан в файле"}. ` : ""}Строк: <span data-testid={`orgmap-rows-${idx}`}>{g.rows}</span>
                      {g.sampleRows.length > 0 ? ` (напр. ${g.sampleRows.join(", ")})` : ""}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant={causeVariant(g.cause)}>{CAUSE_LABEL[g.cause]}</Badge>
                      {g.mappedTo && <span className="text-muted-foreground">→ {g.mappedTo.path}</span>}
                      {!g.mappedTo && g.resolvedTo && <span className="text-muted-foreground">→ {g.resolvedTo.path}</span>}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {g.candidates.length > 0 && (
                      <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="Кандидаты в справочнике">
                        {g.candidates.map((c) => (
                          <li key={c.id}>
                            {c.path} — {c.kind === "EXACT" ? "то же название" : c.kind === "ALIAS" ? "закреплённое написание" : c.kind === "INACTIVE" ? "неактивно" : c.kind === "OTHER_LEVEL" ? "другой уровень" : "похоже"}
                            {!c.allowed && c.why ? ` (${c.why})` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canPick || g.mappedTo ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select aria-label={`Действие для «${g.srcName}»`} value={d.action} onChange={(e) => setDraft(g, { action: e.target.value as Choice, orgUnitId: undefined })} disabled={busy !== null} data-testid={`orgmap-action-${idx}`}>
                          <option value="">— оставить без изменений —</option>
                          {canPick && allowed.some((c) => c.allowed) && <option value="MAP">Сопоставить в этом импорте</option>}
                          {canPick && allowed.some((c) => c.allowed) && <option value="ALIAS">Закрепить написание в справочнике</option>}
                          {canCreate && <option value="CREATE">Создать новое {g.kind === "UNIT" ? "в этом департаменте" : "подразделение"}</option>}
                          {g.mappedTo && <option value="CLEAR">Снять сопоставление</option>}
                        </Select>
                        {(d.action === "MAP" || d.action === "ALIAS") && (
                          <Select aria-label={`Подразделение для «${g.srcName}»`} value={d.orgUnitId ?? ""} onChange={(e) => setDraft(g, { action: d.action, orgUnitId: e.target.value ? Number(e.target.value) : undefined })} disabled={busy !== null} data-testid={`orgmap-target-${idx}`}>
                            <option value="">— выберите подразделение —</option>
                            {allowed.map((c) => (<option key={c.id} value={c.id} disabled={!c.allowed}>{c.path}{c.allowed ? "" : ` — ${c.why ?? "недоступно"}`}</option>))}
                          </Select>
                        )}
                      </div>
                    ) : null}
                    {d.action === "CREATE" && homonym && (
                      <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" className="mt-0.5" checked={d.confirmHomonym === true} onChange={(e) => setDraft(g, { action: "CREATE", confirmHomonym: e.target.checked })} data-testid={`orgmap-homonym-${idx}`} />
                        Это другое подразделение с тем же названием (у другого департамента такое уже есть)
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <li className="p-3 text-sm text-muted-foreground">Нет значений под выбранный фильтр.</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Показано {Math.min(show, visible.length)} из {visible.length}.</span>
            {visible.length > show && <Button type="button" size="sm" variant="outline" onClick={() => setShow((s) => s + PAGE_SHOW)}>Показать ещё</Button>}
            {scan.list.length < scan.groups && <Button type="button" size="sm" variant="outline" onClick={loadMore} data-testid="orgmap-load-more">Загрузить остальные значения ({scan.groups - scan.list.length})</Button>}
          </div>
        </>
      )}

      {preview && (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm" data-testid="orgmap-preview" role="status">
          <p className="font-medium">Предпросмотр (ничего не сохранено)</p>
          <p data-testid="orgmap-preview-summary">
            Значений: {preview.result.ok + preview.result.failed}; допустимо: <strong>{preview.result.ok}</strong>, отклонено: <strong>{preview.result.failed}</strong>.
            Сопоставить: {preview.result.mapped}. Закрепить написаний: {preview.result.aliases}. Создать подразделений: {preview.result.created}. Затронуто строк: {preview.result.rowsAffected}.
            Останется нерешённых значений: {unmapped}.
          </p>
          {preview.result.items.filter((i) => !i.ok).slice(0, 10).map((i) => (
            <p key={`${i.kind}|${i.scope}|${i.srcName}|${i.action}`} className="text-xs text-destructive" data-testid="orgmap-preview-error">«{i.srcName}»: {i.error}</p>
          ))}
        </div>
      )}
      {note && <p className="text-sm" data-testid="orgmap-note">{note}</p>}
      <FormAlert error={error} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={doPreview} disabled={busy !== null || items.length === 0} data-testid="orgmap-preview-btn">
          {busy === "map" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Предпросмотр{items.length > 0 ? ` (${items.length})` : ""}
        </Button>
        <Button type="button" onClick={() => setDlg(true)} disabled={busy !== null || !preview || preview.result.ok === 0} data-testid="orgmap-save-btn">
          Сохранить и перепроверить
        </Button>
        {(needsReanalyze || scan.rowsWithUnitIssue > 0) && (
          <Button type="button" variant="outline" onClick={reanalyzeOnly} disabled={busy !== null} data-testid="orgmap-reanalyze-all">
            {busy === "reanalyze" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Перепроверить все нерешённые строки ({scan.rowsWithUnitIssue})
          </Button>
        )}
      </div>

      <ReasonDialog
        open={dlg}
        title="Сохранить сопоставление оргструктуры"
        description={preview ? `Будет сохранено значений: ${preview.result.ok} (сопоставить ${preview.result.mapped}, закрепить написаний ${preview.result.aliases}, создать подразделений ${preview.result.created}); затронуто строк: ${preview.result.rowsAffected}. Затем все нерешённые строки будут перепроверены. Сотрудники на этом шаге не создаются.` : ""}
        confirmLabel="Сохранить"
        onClose={() => setDlg(false)}
        onConfirm={(reason) => doSave(reason)}
        testId="orgmap-dialog"
      />
    </div>
  );
}
