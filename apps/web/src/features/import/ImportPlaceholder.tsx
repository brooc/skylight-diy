import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

type ListsResponse = {
  lists: Array<{
    id: string;
    title: string;
    color?: string | null;
    sortOrder: number;
    items: Array<{
      id: string;
      listId: string;
      title: string;
      completed: boolean;
      sortOrder: number;
    }>;
  }>;
};

const fallbackTints = ["#f6eee1", "#f7e5ea", "#eeecf5", "#d9eff0", "#edf4de"];

export function ImportPlaceholder(): JSX.Element {
  const queryClient = useQueryClient();
  const now = new Date();
  const [isAdding, setIsAdding] = useState(false);
  const [mode, setMode] = useState<"item" | "list">("item");
  const [selectedListId, setSelectedListId] = useState("");
  const [title, setTitle] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const listsQuery = useQuery({
    queryKey: queryKeys.lists,
    queryFn: () => apiFetch<ListsResponse>("/lists")
  });

  const lists = listsQuery.data?.lists ?? [];
  const canSubmit =
    title.trim().length > 0 && (mode === "list" || selectedListId.length > 0) && !isSubmitting;
  const defaultListId = useMemo(() => lists[0]?.id ?? "", [lists]);
  const activeListId = selectedListId || defaultListId;

  if (listsQuery.isLoading) {
    return <LoadingState label="Loading lists..." />;
  }

  if (listsQuery.isError) {
    return <ErrorState message={listsQuery.error.message} />;
  }

  return (
    <>
      {isAdding ? (
        <section className="grid gap-3 rounded-md border border-[#e7e7e5] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-2xl text-slate-900">Add</h2>
            <button
              type="button"
              className="rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
              onClick={() => {
                setIsAdding(false);
                setSubmitError(null);
              }}
            >
              Cancel
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("item")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                mode === "item"
                  ? "bg-[#e9eef5] text-slate-900"
                  : "bg-[#f6f7f9] text-slate-600 hover:text-slate-900"
              }`}
            >
              Item
            </button>
            <button
              type="button"
              onClick={() => setMode("list")}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                mode === "list"
                  ? "bg-[#e9eef5] text-slate-900"
                  : "bg-[#f6f7f9] text-slate-600 hover:text-slate-900"
              }`}
            >
              List
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {mode === "item" ? (
              <label className="grid gap-1 md:col-span-1">
                <span className="text-sm font-medium text-slate-700">List</span>
                <select
                  value={activeListId}
                  onChange={(event) => setSelectedListId(event.target.value)}
                  className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
                >
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className={`grid gap-1 ${mode === "item" ? "md:col-span-2" : "md:col-span-3"}`}>
              <span className="text-sm font-medium text-slate-700">
                {mode === "item" ? "Item title" : "List title"}
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-[44px] rounded-md border border-[#d9d8d4] bg-white px-3 text-base text-slate-900"
                placeholder={mode === "item" ? "New item" : "New list"}
              />
            </label>
          </div>
          {submitError ? <p className="text-sm text-rose-700">{submitError}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canSubmit}
              className="min-h-[44px] rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d5f59] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={async () => {
                setSubmitError(null);
                setIsSubmitting(true);
                try {
                  if (mode === "list") {
                    await apiFetch("/lists", {
                      method: "POST",
                      body: JSON.stringify({ title: title.trim() })
                    });
                  } else {
                    await apiFetch(`/lists/${activeListId}/items`, {
                      method: "POST",
                      body: JSON.stringify({ title: title.trim() })
                    });
                  }
                  setTitle("");
                  setIsAdding(false);
                  await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
                } catch (error) {
                  setSubmitError(error instanceof Error ? error.message : "Failed to add.");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              {isSubmitting ? "Saving..." : `Add ${mode}`}
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-[#e7e7e5] bg-white p-3">
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#ecebe8] bg-[#fbfbfa] px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="font-display text-4xl leading-none text-slate-900 md:text-5xl">
              {now.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric"
              })}
            </div>
            <div className="font-display text-4xl leading-none text-slate-900 md:text-5xl">
              {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-[32px] leading-none text-slate-500 md:text-[44px]">☀ 80°</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="min-h-[40px] rounded-full bg-[#f0f2f5] px-4 text-sm font-semibold text-slate-700"
            >
              Filter
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f2f5] text-xl text-slate-700"
            >
              ‹
            </button>
            <button
              type="button"
              className="min-h-[40px] rounded-full bg-[#f0f2f5] px-4 text-sm font-semibold text-slate-700"
            >
              Today
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f2f5] text-xl text-slate-700"
            >
              ›
            </button>
          </div>
        </header>

        <div className="overflow-x-auto">
          {lists.length === 0 ? (
            <div className="rounded-md border border-[#e7e7e5] bg-[#fbfbfa] px-4 py-8 text-center text-slate-600">
              No lists yet. Use + to create your first list.
            </div>
          ) : (
            <div className="grid min-w-[1200px] grid-cols-4 gap-3">
              {lists.map((list, index) => (
                <article
                  key={list.id}
                  className="rounded-[22px] border border-[#ecebe8] p-3"
                  style={{
                    backgroundColor: list.color ?? fallbackTints[index % fallbackTints.length]
                  }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-display text-3xl text-slate-900">{list.title}</h2>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-sm font-semibold text-slate-700">
                      {list.items.length}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {list.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/lists/${list.id}/items/${item.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ completed: !item.completed })
                          });
                          await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
                        }}
                        className="flex min-h-[50px] items-center justify-between rounded-xl bg-white/65 px-3 text-left text-lg text-slate-800"
                      >
                        <span className={item.completed ? "line-through opacity-60" : ""}>
                          {item.title}
                        </span>
                        <span
                          className={`h-7 w-7 rounded-md border ${
                            item.completed
                              ? "border-[#6ea088] bg-[#b7d9c8]"
                              : "border-[#e3e1dc] bg-white"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        aria-label="Add"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2b98db] text-white shadow-[0_6px_16px_rgba(30,64,175,0.22)] transition-colors hover:bg-[#2588c3]"
        onClick={() => {
          setSubmitError(null);
          setIsAdding(true);
        }}
      >
        <span className="relative -top-px text-4xl font-normal leading-none">+</span>
      </button>
    </>
  );
}
