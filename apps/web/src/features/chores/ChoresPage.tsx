import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { toolbarPillButtonClass } from "../../components/toolbarButtonStyles";
import { ChoreList } from "./ChoreList";
import { RewardBalance } from "./RewardBalance";

type Frequency = "daily" | "weekly" | "once";
type Task = {
  id: string;
  title: string;
  description?: string | null;
  points: number;
  assignedPersonId?: string | null;
  assignedPersonName?: string | null;
  assignedPersonColor?: string | null;
  frequency?: Frequency;
  dueDate?: string | null;
  weekdays?: string[] | null;
  active?: boolean;
  completed: boolean;
  completedByPersonName?: string | null;
};
type Balance = {
  personId: string;
  displayName: string;
  color: string;
  balance: number;
};
type HistoryItem = {
  id: string;
  personName: string;
  title: string;
  amount: number;
  type: "earned" | "spent" | "reset";
  occurredAt: string;
};

const weekdays = [
  ["MO", "Mon"], ["TU", "Tue"], ["WE", "Wed"], ["TH", "Thu"],
  ["FR", "Fri"], ["SA", "Sat"], ["SU", "Sun"]
] as const;

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as { message?: string; error?: string };
    return parsed.message ?? parsed.error?.replace(/_/g, " ") ?? fallback;
  } catch {
    return error.message || fallback;
  }
}

export function ChoresPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const addRequested = searchParams.get("add") === "1";
  const manageRequested = searchParams.get("manage") === "1";
  const [isAdding, setIsAdding] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState(1);
  const [assignedPersonId, setAssignedPersonId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [dueDate, setDueDate] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(["MO"]);
  const [completionTask, setCompletionTask] = useState<Task | null>(null);
  const [pointPerson, setPointPerson] = useState<Balance | null>(null);
  const [pointAmount, setPointAmount] = useState(1);
  const [pointReason, setPointReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const choresQuery = useQuery({
    queryKey: queryKeys.todayChores,
    queryFn: () => apiFetch<{ date: string; chores: Task[] }>("/chores/today")
  });
  const rewardsQuery = useQuery({
    queryKey: queryKeys.rewardBalances,
    queryFn: () => apiFetch<{ balances: Balance[] }>("/rewards/balances")
  });
  const historyQuery = useQuery({
    queryKey: ["reward-history"],
    queryFn: () => apiFetch<{ history: HistoryItem[] }>("/rewards/history")
  });
  const manageQuery = useQuery({
    queryKey: ["manage-tasks"],
    queryFn: () => apiFetch<{ chores: Task[] }>("/chores/manage"),
    enabled: isManaging
  });

  useEffect(() => {
    if (addRequested) setIsAdding(true);
    if (manageRequested) setIsManaging(true);
  }, [addRequested, manageRequested]);
  useEffect(() => {
    if (!status) return undefined;
    const timeout = window.setTimeout(() => setStatus(null), 3_500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const resetForm = (): void => {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setPoints(1);
    setAssignedPersonId("");
    setFrequency("daily");
    setDueDate(choresQuery.data?.date ?? "");
    setSelectedWeekdays(["MO"]);
    setIsAdding(false);
  };
  const beginEdit = (task: Task): void => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPoints(task.points);
    setAssignedPersonId(task.assignedPersonId ?? "");
    setFrequency(task.frequency ?? "daily");
    setDueDate(task.dueDate ?? choresQuery.data?.date ?? "");
    setSelectedWeekdays(task.weekdays?.length ? task.weekdays : ["MO"]);
    setIsAdding(true);
    setSubmitError(null);
  };
  const refreshTasks = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.todayChores }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rewardBalances }),
      queryClient.invalidateQueries({ queryKey: ["reward-history"] }),
      queryClient.invalidateQueries({ queryKey: ["manage-tasks"] })
    ]);
  };

  if (choresQuery.isLoading || rewardsQuery.isLoading) return <LoadingState />;
  if (choresQuery.isError) return <ErrorState message={choresQuery.error.message} />;
  if (rewardsQuery.isError) return <ErrorState message={rewardsQuery.error.message} />;

  const tasks = choresQuery.data?.chores ?? [];
  const balances = rewardsQuery.data?.balances ?? [];
  const canSubmit = title.trim().length > 0 && points >= 1 && points <= 100 &&
    (frequency !== "once" || Boolean(dueDate)) &&
    (frequency !== "weekly" || selectedWeekdays.length > 0) && !isSubmitting;

  return (
    <div className="grid gap-4 pb-20">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
        <div><h1 className="font-display text-2xl text-slate-900">Tasks</h1><p className="text-sm text-slate-600">Complete today’s jobs and earn family points.</p></div>
        <button type="button" className={toolbarPillButtonClass} onClick={() => setIsManaging((value) => !value)}>{isManaging ? "Done managing" : "Manage tasks"}</button>
      </header>
      {status ? <div role="status" className="rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{status}</div> : null}
      {submitError ? <div role="alert" className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800">{submitError}</div> : null}
      {isAdding ? (
        <section className="grid gap-4 rounded-xl border border-[#e0d6c7] bg-white p-4">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl text-slate-900">{editingTask ? "Edit task" : "Add task"}</h2><button type="button" className="min-h-[40px] px-3 font-semibold text-slate-600" onClick={resetForm}>Cancel</button></div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 md:col-span-2"><span className="text-sm font-medium text-slate-700">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-[44px] rounded-md border border-[#d9d8d4] px-3" /></label>
            <label className="grid gap-1 md:col-span-2"><span className="text-sm font-medium text-slate-700">Description <span className="font-normal">(optional)</span></span><input value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[44px] rounded-md border border-[#d9d8d4] px-3" /></label>
            <label className="grid gap-1"><span className="text-sm font-medium text-slate-700">Assigned person</span><select value={assignedPersonId} onChange={(event) => setAssignedPersonId(event.target.value)} className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3"><option value="">Anyone</option>{balances.map((person) => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}</select></label>
            <label className="grid gap-1"><span className="text-sm font-medium text-slate-700">Points</span><input type="number" min={1} max={100} value={points} onChange={(event) => setPoints(Number(event.target.value))} className="min-h-[44px] rounded-md border border-[#d9d8d4] px-3" /></label>
            <label className="grid gap-1"><span className="text-sm font-medium text-slate-700">Schedule</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)} className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3"><option value="daily">Every day</option><option value="weekly">Selected weekdays</option><option value="once">One time</option></select></label>
            {frequency === "once" ? <label className="grid gap-1"><span className="text-sm font-medium text-slate-700">Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="min-h-[44px] rounded-md border border-[#d9d8d4] px-3" /></label> : null}
            {frequency === "weekly" ? <fieldset className="grid gap-2 md:col-span-2"><legend className="text-sm font-medium text-slate-700">Days</legend><div className="flex flex-wrap gap-2">{weekdays.map(([value, label]) => <label key={value} className={`flex min-h-[42px] items-center rounded-full border px-3 ${selectedWeekdays.includes(value) ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}><input type="checkbox" className="sr-only" checked={selectedWeekdays.includes(value)} onChange={() => setSelectedWeekdays((days) => days.includes(value) ? days.filter((day) => day !== value) : [...days, value])} />{label}</label>)}</div></fieldset> : null}
          </div>
          <div className="flex justify-end"><button type="button" disabled={!canSubmit} className="min-h-[44px] rounded-md bg-[#0f766e] px-5 font-semibold text-white disabled:opacity-50" onClick={async () => {
            setIsSubmitting(true); setSubmitError(null);
            try {
              const payload = { title: title.trim(), description: description.trim() || null, points, assignedPersonId: assignedPersonId || null, frequency, dueDate: frequency === "once" ? dueDate : null, weekdays: frequency === "weekly" ? selectedWeekdays : null };
              await apiFetch(editingTask ? `/chores/${editingTask.id}` : "/chores", { method: editingTask ? "PATCH" : "POST", body: JSON.stringify(payload) });
              setStatus(editingTask ? "Task updated." : "Task added."); resetForm(); await refreshTasks();
            } catch (error) { setSubmitError(errorMessage(error, "The task could not be saved.")); } finally { setIsSubmitting(false); }
          }}>{isSubmitting ? "Saving…" : editingTask ? "Save changes" : "Add task"}</button></div>
        </section>
      ) : null}
      {tasks.length === 0 ? <EmptyState title="No tasks due" description="There are no tasks scheduled for today." /> : <ChoreList chores={tasks} onEdit={isManaging ? beginEdit : undefined} onRemove={isManaging ? async (task) => { await apiFetch(`/chores/${task.id}`, { method: "DELETE" }); setStatus("Task removed. You can restore it from archived tasks."); await refreshTasks(); } : undefined} onToggle={async (task, nextCompleted) => {
        setSubmitError(null);
        try {
          if (nextCompleted && !task.assignedPersonId) { setCompletionTask(task); return; }
          const date = choresQuery.data?.date;
          if (nextCompleted) await apiFetch(`/chores/${task.id}/complete${date ? `?date=${date}` : ""}`, { method: "POST", body: JSON.stringify({}) });
          else await apiFetch(`/chores/${task.id}/complete?date=${date}`, { method: "DELETE" });
          await refreshTasks();
        } catch (error) { setSubmitError(errorMessage(error, "The task could not be updated.")); }
      }} />}
      {isManaging && manageQuery.data?.chores.some((task) => !task.active) ? <section className="grid gap-2 rounded-md border border-[#e0d6c7] bg-white p-4"><h2 className="font-semibold text-slate-900">Archived tasks</h2>{manageQuery.data.chores.filter((task) => !task.active).map((task) => <div key={task.id} className="flex min-h-[44px] items-center justify-between gap-3 border-t border-slate-100 py-2"><span>{task.title}</span><button type="button" className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold" onClick={async () => { await apiFetch(`/chores/${task.id}/restore`, { method: "POST" }); setStatus("Task restored."); await refreshTasks(); }}>Restore</button></div>)}</section> : null}
      <RewardBalance balances={balances} canManage={isManaging} onUsePoints={(person) => { setPointPerson(person); setPointAmount(1); setPointReason(""); }} onReset={async (person) => { await apiFetch(`/rewards/${person.personId}/reset`, { method: "POST" }); setStatus(`${person.displayName}'s balance was reset.`); await refreshTasks(); }} />
      {(historyQuery.data?.history.length ?? 0) > 0 ? <section className="grid gap-2 rounded-md border border-[#e0d6c7] bg-white p-4"><h2 className="font-semibold text-slate-900">Recent point activity</h2>{historyQuery.data!.history.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-sm"><div><span className="font-medium text-slate-800">{item.personName}</span><span className="text-slate-500"> · {item.title}</span></div><span className={item.amount >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{item.amount > 0 ? "+" : ""}{item.amount}</span></div>)}</section> : null}
      {completionTask ? <div role="dialog" aria-modal="true" aria-label="Who completed this task?" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="grid w-full max-w-sm gap-3 rounded-2xl bg-white p-5 shadow-xl"><h2 className="font-display text-2xl">Who completed it?</h2><p className="text-sm text-slate-600">{completionTask.title}</p>{balances.map((person) => <button key={person.personId} type="button" className="min-h-[44px] rounded-md px-4 text-left font-semibold" style={{ backgroundColor: `${person.color}22` }} onClick={async () => { await apiFetch(`/chores/${completionTask.id}/complete?date=${choresQuery.data?.date}`, { method: "POST", body: JSON.stringify({ personId: person.personId }) }); setCompletionTask(null); await refreshTasks(); }}>{person.displayName}</button>)}<button type="button" className="min-h-[44px] text-slate-600" onClick={() => setCompletionTask(null)}>Cancel</button></div></div> : null}
      {pointPerson ? <div role="dialog" aria-modal="true" aria-label="Use points" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form className="grid w-full max-w-sm gap-3 rounded-2xl bg-white p-5 shadow-xl" onSubmit={async (event) => { event.preventDefault(); try { await apiFetch(`/rewards/${pointPerson.personId}/reduce`, { method: "POST", body: JSON.stringify({ amount: pointAmount, reason: pointReason.trim() }) }); setStatus(`${pointAmount} points used for ${pointPerson.displayName}.`); setPointPerson(null); await refreshTasks(); } catch (error) { setSubmitError(errorMessage(error, "Points could not be reduced.")); } }}><h2 className="font-display text-2xl">Use {pointPerson.displayName}'s points</h2><p className="text-sm text-slate-600">Available: {pointPerson.balance}</p><label className="grid gap-1"><span>Amount</span><input type="number" min={1} max={pointPerson.balance} value={pointAmount} onChange={(event) => setPointAmount(Number(event.target.value))} className="min-h-[44px] rounded-md border px-3" /></label><label className="grid gap-1"><span>Reason</span><input required value={pointReason} onChange={(event) => setPointReason(event.target.value)} placeholder="Movie night" className="min-h-[44px] rounded-md border px-3" /></label><div className="flex justify-end gap-2"><button type="button" className="min-h-[44px] px-4" onClick={() => setPointPerson(null)}>Cancel</button><button type="submit" disabled={!pointReason.trim() || pointAmount < 1 || pointAmount > pointPerson.balance} className="min-h-[44px] rounded-md bg-[#0f766e] px-4 font-semibold text-white disabled:opacity-50">Use points</button></div></form></div> : null}
      <button type="button" aria-label="Add" className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-[#227fb8] bg-[#2b98db] text-4xl text-white" onClick={() => { setSubmitError(null); setIsAdding(true); }}>+</button>
    </div>
  );
}
