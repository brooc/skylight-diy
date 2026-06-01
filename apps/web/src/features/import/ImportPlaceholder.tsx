const demoLists = [
  {
    title: "Grocery List",
    count: 5,
    tint: "#f6eee1",
    items: ["Eggs", "Milk", "Bread", "Apples", "Lettuce", "Hot Sauce"]
  },
  {
    title: "Packing List",
    count: 15,
    tint: "#f7e5ea",
    items: ["Shirts x5", "Jeans x2", "Undies x7", "Swimsuits x3", "Towel x2", "Sunscreen"]
  },
  {
    title: "To-Do",
    count: 7,
    tint: "#eeecf5",
    items: ["Pack for trip", "Pet sitter", "Stop mail", "Copy of keys", "Set up sprinkler", "Snacks!"]
  },
  {
    title: "Travel Bucket List",
    count: 12,
    tint: "#d9eff0",
    items: ["Japan", "Ireland", "Croatia", "Spain", "Costa Rica", "Greece"]
  }
];

export function ImportPlaceholder(): JSX.Element {
  const now = new Date();

  return (
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
        <div className="grid min-w-[1200px] grid-cols-4 gap-3">
          {demoLists.map((list) => (
            <article
              key={list.title}
              className="rounded-[22px] border border-[#ecebe8] p-3"
              style={{ backgroundColor: list.tint }}
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-3xl text-slate-900">{list.title}</h2>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/75 text-sm font-semibold text-slate-700">
                  {list.count}
                </div>
              </div>
              <div className="grid gap-2">
                {list.items.map((item) => (
                  <div
                    key={item}
                    className="flex min-h-[50px] items-center justify-between rounded-xl bg-white/65 px-3 text-lg text-slate-800"
                  >
                    <span>{item}</span>
                    <span className="h-7 w-7 rounded-md border border-[#e3e1dc] bg-white" />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
