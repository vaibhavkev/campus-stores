(() => {
  const storageKey = "campus-stores.shift.v1";
  const root = document.getElementById("campus-stores");
  const q = (selector) => root.querySelector(selector);
  const requests = [
    {
      id: "RQ-214",
      club: "Film Society",
      event: "Courtyard screening",
      owner: "Isha Rao",
      due: "Fri 8 pm",
      items: ["HDMI projector", "Portable speaker", "USB-C → HDMI adapter"],
      note: "Playback is from a USB-C-only laptop. The host will collect at 4 pm.",
    },
    {
      id: "RQ-209",
      club: "Debate Union",
      event: "Finals rehearsal",
      owner: "Tara Shah",
      due: "Sat 10 am",
      items: ["Wireless microphone"],
      note: "Rehearsal runs into the evening.",
    },
    {
      id: "RQ-217",
      club: "Photo Circle",
      event: "Street portrait walk",
      owner: "Dev Menon",
      due: "Sat noon",
      items: ["Digital camera"],
      note: "Collection on Saturday morning.",
    },
  ];
  const assets = [
    { id: "PR-04", type: "HDMI projector", model: "BenQ MH550", bin: "A2" },
    {
      id: "PR-06",
      type: "HDMI projector",
      model: "Epson EB-X49",
      bin: "Workshop",
      repair: true,
    },
    { id: "SP-02", type: "Portable speaker", model: "JBL Eon One", bin: "B1" },
    { id: "SP-05", type: "Portable speaker", model: "Bose S1", bin: "B2" },
    {
      id: "AD-12",
      type: "USB-C → HDMI adapter",
      model: "Belkin AVC002",
      bin: "C4",
    },
    {
      id: "AD-15",
      type: "USB-C → HDMI adapter",
      model: "Anker A8312",
      bin: "C4",
    },
    { id: "MI-09", type: "Wireless microphone", model: "Shure BLX", bin: "B3" },
    { id: "CA-03", type: "Digital camera", model: "Sony A6400", bin: "D2" },
  ];
  const people = [
    "Isha Rao",
    "Kabir Sen",
    "Leela Das",
    "Tara Shah",
    "Dev Menon",
  ];
  const shifts = [
    {
      time: "Friday · 3:45 pm",
      title: "Pickup at the counter",
      text: "Kabir is here for the Film Society screening. The film starts at four. Can he leave with everything he needs?",
      next: "Move to return time",
    },
    {
      time: "Friday · 7:30 pm",
      title: "The kit comes back in pieces",
      text: "Kabir has brought back the projector and speaker. “Leela still has the adapter. She’ll drop it off tomorrow at nine.” Take the return and hand over to the morning shift.",
      next: "Move to next morning",
    },
    {
      time: "Saturday · 9:00 am",
      title: "Morning shift",
      text: "You’ve just taken over. Leela walks in with an adapter. Work out what was outstanding from the screening and close the loan for the right item.",
    },
  ];
  // Hours from Friday 00:00, so the register can tell when a slip is late.
  const clock = [15.75, 19.5, 33];
  const dueAt = { "Fri 8 pm": 20, "Sat 9 am": 33, "Sat 10 am": 34, "Sat noon": 36 };
  const times = Object.keys(dueAt);
  const pages = [
    ["Requests", "clipboard-list"],
    ["Inventory", "package"],
    ["Loan register", "book-open"],
    ["Desk book", "messages-square"],
  ];
  const original = () => ({
    version: 1,
    tab: "Requests",
    phase: 0,
    selected: "",
    filter: "All items",
    loans: [
      {
        num: 401,
        req: "RQ-209",
        asset: "MI-09",
        who: "Tara Shah",
        due: "Sat 10 am",
        back: false,
      },
    ],
    notes: [],
    editing: false,
    noting: 0,
    undo: 0,
    onlyOpen: true,
    notice: "Sample shift · All records are fictional.",
  });
  let s = original();
  let focusNote = false;
  let focusBack = "";
  const getAsset = (id) => assets.find((x) => x.id === id);
  const getReq = (id) => requests.find((x) => x.id === id);
  const out = (id) => s.loans.find((l) => l.asset === id && !l.back);
  const late = (l) => !l.back && clock[s.phase] > dueAt[l.due];
  // A slip can be noted once it is late, or once part of its request has come back.
  const canNote = (l) =>
    l.holder || late(l) || s.loans.some((x) => x.req === l.req && x.back);
  const noteButton = (num) => '[data-action="still"][data-val="' + num + '"]';
  const esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const opts = (list) =>
    list
      .map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + "</option>")
      .join("");
  const btn = (label, act, val = "", style = "", name = "") =>
    '<button type="button" data-action="' +
    act +
    '" data-val="' +
    esc(val) +
    '" class="' +
    style +
    '"' +
    (name ? ' aria-label="' + esc(name) + '"' : "") +
    ">" +
    esc(label) +
    "</button>";
  const head = (title, sub, control = "") =>
    '<div class="sectionhead"><div><h2>' +
    title +
    "</h2><small>" +
    sub +
    "</small></div>" +
    control +
    "</div>";
  const row = (label, sub, right, kind = "") =>
    '<div class="row' +
    (kind ? " " + kind : "") +
    '"><div><strong>' +
    esc(label) +
    "</strong><small>" +
    esc(sub) +
    "</small></div><div>" +
    right +
    "</div></div>";
  const badge = (t, good = false) =>
    '<span class="tag' + (good ? " good" : "") + '">' + esc(t) + "</span>";
  const select = (label, key, options) =>
    "<label><span>" +
    label +
    '</span><select name="' +
    key +
    '" required><option value="">Select…</option>' +
    opts(options) +
    "</select></label>";
  // The change: a slip that stays open can say why. It records who has the
  // unit now and when it is expected, without closing or rewriting the slip.
  const stillLine = (l) =>
    '<p class="still"><b>Still out</b> · with ' +
    esc(l.holder) +
    " · expected " +
    esc(l.expect) +
    " · noted " +
    esc(shifts[l.noted].time) +
    "</p>";
  const stillForm = (l) =>
    '<form data-still="' +
    l.num +
    '" class="stillform"><div class="form">' +
    select(
      "Who has it now",
      "holder",
      people.map((p) => [p, p]),
    ) +
    select(
      "Expected back",
      "expect",
      times.map((t) => [t, t]),
    ) +
    '</div><div class="buttons"><button type="submit" class="primary">Save note</button>' +
    btn("Cancel", "stillcancel") +
    "</div></form>";
  function requestPage() {
    let html = head(
      "Approved requests",
      "Student Activities Office · 3 approved forms",
    );
    if (s.selected) {
      const r = getReq(s.selected);
      html +=
        btn("Back to list", "close") +
        '<div class="record"><small>' +
        r.id +
        " · Approved</small><h3>" +
        r.event +
        "</h3><p>" +
        r.club +
        " · Filed by " +
        r.owner +
        "</p><p><b>Return by</b> " +
        r.due +
        "</p><p><b>Approved equipment</b></p><ul>" +
        r.items.map((x) => "<li>" + x + "</li>").join("") +
        "</ul><p>" +
        r.note +
        "</p></div>";
    } else
      html += requests
        .map((r) =>
          row(
            r.event,
            r.id + " · " + r.club,
            btn("View form", "request", r.id),
          ),
        )
        .join("");
    return html;
  }
  function inventory() {
    let html = head(
      "Inventory",
      "Physical units · home shelf and current availability",
    );
    html +=
      '<div class="buttons"><label>Show <select data-filter>' +
      opts(
        ["All items", "On shelf", "On loan", "In repair"].map((f) => [f, f]),
      ) +
      "</select></label></div>";
    for (const a of assets) {
      const status = a.repair
        ? "In repair"
        : out(a.id)
          ? "On loan"
          : "On shelf";
      if (s.filter !== "All items" && s.filter !== status) continue;
      html += row(
        a.id + " · " + a.type,
        a.model + " · " + a.bin,
        badge(status, status === "On shelf"),
      );
    }
    return html;
  }
  function register() {
    let html = head(
      "Loan register",
      "One slip per physical unit",
      s.editing
        ? btn("Cancel", "cancel")
        : btn("New issue slip", "new", "", "primary"),
    );
    if (s.editing) {
      const available = assets.filter((a) => !a.repair && !out(a.id));
      return (
        html +
        '<form data-issue><div class="form">' +
        select(
          "Approved request",
          "req",
          requests.map((r) => [r.id, r.id + " · " + r.club]),
        ) +
        select(
          "Unit leaving the desk",
          "asset",
          available.map((a) => [a.id, a.id + " · " + a.type]),
        ) +
        select(
          "Collected by",
          "who",
          people.map((p) => [p, p]),
        ) +
        select(
          "Return by",
          "due",
          times.map((d) => [d, d]),
        ) +
        '</div><button type="submit" class="primary">Save issue slip</button></form>'
      );
    }
    html +=
      '<div class="buttons">' +
      ["Outstanding", "All slips"]
        .map(
          (v, i) =>
            '<button type="button" data-action="scope" data-val="' +
            i +
            '" aria-pressed="' +
            (s.onlyOpen === (i === 0)) +
            '">' +
            v +
            "</button>",
        )
        .join("") +
      "</div>";
    const shown = s.loans
      // The slip just returned stays in place, so the row under the pointer
      // does not become another slip, and the return can be undone.
      .filter((l) => !s.onlyOpen || !l.back || l.num === s.undo)
      .slice()
      .reverse();
    if (!shown.length) html += "<p>No outstanding slips.</p>";
    for (const l of shown) {
      // Plain words first: what the unit is and whose job it belongs to.
      const name = getAsset(l.asset).type + " · " + l.asset;
      html += row(
        name,
        "L-" +
          l.num +
          " · " +
          getReq(l.req).club +
          " (" +
          l.req +
          ") · Issued to " +
          l.who +
          " · Due " +
          l.due,
        l.back
          ? badge("Returned") +
            (l.num === s.undo
              ? btn("Undo", "undo", String(l.num), "", "Undo return " + name)
              : "")
          : (late(l) ? '<span class="tag late">Overdue</span>' : "") +
              (canNote(l)
                ? btn("Still out…", "still", String(l.num), "", "Still out… " + name)
                : "") +
              btn("Record return", "return", String(l.num), "", "Record return " + name),
        "slip",
      );
      if (l.holder && !l.back) html += stillLine(l);
      if (s.noting === l.num) html += stillForm(l);
    }
    return html;
  }
  function deskbook() {
    let html = head(
      "Desk book",
      "Messages from clubs and notes for the next shift",
    );
    const entries = [
      [
        "Friday · 3:20 pm",
        "Isha Rao · Film Society",
        "Kabir Sen is picking up our whole screening kit. Please issue it in his name. I’m setting up in the courtyard.",
      ],
      [
        "Friday · 3:30 pm",
        "Tara Shah · Debate Union",
        "Our microphone stays with me overnight. I’ll return it by 10 am Saturday.",
      ],
    ];
    if (s.phase >= 1)
      entries.push([
        "Friday · 7:30 pm",
        "Kabir Sen · Film Society",
        "I brought the projector and speaker. Leela Das has our adapter. She’ll be at the counter at 9 am tomorrow.",
      ]);
    for (const n of s.notes)
      entries.push([shifts[n.phase].time, "Counter handover", n.text]);
    // Slips that say why they are still open show here too, read from the slip itself.
    for (const l of s.loans)
      if (l.holder && !l.back)
        entries.push([
          shifts[l.noted].time,
          "Still out · " + getAsset(l.asset).type + " " + l.asset,
          "With " +
            l.holder +
            ", expected " +
            l.expect +
            ". Slip L-" +
            l.num +
            ", " +
            getReq(l.req).club +
            ".",
        ]);
    for (const [t, author, body] of entries.slice().reverse())
      html +=
        '<article class="record"><small>' +
        esc(t) +
        "</small><h3>" +
        esc(author) +
        "</h3><p>" +
        esc(body) +
        "</p></article>";
    return (
      html +
      '<form data-note><div class="form"><label class="full"><span>Note for the next shift</span><textarea name="note" rows="2" maxlength="400" required></textarea></label></div><button type="submit">Add handover note</button></form>'
    );
  }
  const screens = {
    Requests: requestPage,
    Inventory: inventory,
    "Loan register": register,
    "Desk book": deskbook,
  };
  function paint() {
    const phase = shifts[s.phase];
    q("[data-clock]").textContent = phase.time;
    q("[data-shift-title]").textContent = phase.title;
    q("[data-shift]").textContent = phase.text;
    const advance = q('[data-action="advance"]');
    advance.hidden = !phase.next;
    advance.textContent = phase.next || "";
    q("[data-nav]").innerHTML = pages
      .map(
        ([n, icon]) =>
          '<button type="button" data-action="tab" data-val="' +
          n +
          '" aria-pressed="' +
          (s.tab === n) +
          '"><svg aria-hidden="true" class="store-icon"><use href="#icon-' +
          icon +
          '"></use></svg>' +
          n +
          "</button>",
      )
      .join("");
    q("[data-page]").innerHTML = screens[s.tab]();
    if (q("[data-filter]")) q("[data-filter]").value = s.filter;
    const noting = q("[data-still]");
    if (noting) {
      const l = s.loans.find((x) => x.num === s.noting);
      noting.elements.holder.value = l.holder || "";
      noting.elements.expect.value = l.expect || "";
      if (focusNote) noting.elements.holder.focus();
    }
    focusNote = false;
    // After saving or cancelling a note, put keyboard focus back on its slip.
    if (focusBack && q(focusBack)) q(focusBack).focus();
    focusBack = "";
    q("[data-status]").textContent = s.notice;
  }
  function commit(msg) {
    if (msg) s.notice = msg;
    paint();
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      q("[data-status]").textContent +=
        " Browser storage is unavailable. Progress lasts for this visit.";
    }
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const v = b.dataset.val;
    switch (b.dataset.action) {
      case "restart":
        s = original();
        break;
      case "advance":
        if (s.phase < 2) s.phase++;
        s.undo = 0;
        s.notice = "Shift time updated.";
        break;
      case "tab":
        s.tab = v;
        s.editing = false;
        s.noting = 0;
        s.undo = 0;
        break;
      case "undo": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || !l.back || l.num !== s.undo || out(l.asset)) return;
        l.back = false;
        s.undo = 0;
        s.noting = 0;
        focusBack = '[data-action="return"][data-val="' + l.num + '"]';
        s.notice =
          "Return of " + l.asset + " undone. Slip L-" + l.num + " is open again.";
        break;
      }
      case "still":
        s.noting = s.noting === Number(v) ? 0 : Number(v);
        focusNote = s.noting > 0;
        break;
      case "stillcancel":
        focusBack = noteButton(s.noting);
        s.noting = 0;
        break;
      case "close":
        s.selected = "";
        break;
      case "request":
        s.selected = v;
        break;
      case "new":
        s.editing = true;
        s.noting = 0;
        break;
      case "cancel":
        s.editing = false;
        break;
      case "scope":
        s.onlyOpen = v === "0";
        break;
      case "return": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || l.back) return;
        l.back = true;
        s.undo = l.num;
        s.notice = l.asset + " returned to stock. Slip L-" + l.num + " closed.";
        if (s.noting === l.num) s.noting = 0;
        // When one unit from the same request is left out, ask the one
        // question the desk can answer right now: who has it, and until when.
        const rest = s.loans.filter((x) => x.req === l.req && !x.back);
        if (rest.length === 1 && !rest[0].holder) {
          s.noting = rest[0].num;
          focusNote = true;
          s.notice +=
            " One item from " + l.req + " is still out: note who has it.";
        }
        if (!focusNote)
          focusBack = '[data-action="undo"][data-val="' + l.num + '"]';
        break;
      }
    }
    commit();
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-filter]")) {
      s.filter = e.target.value;
      commit();
    }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const form = new FormData(f);
    if (f.matches("[data-note]")) {
      const text = String(form.get("note")).trim();
      if (!text) return;
      s.notes.push({ phase: s.phase, text });
      commit("Handover note saved.");
      return;
    }
    if (f.matches("[data-still]")) {
      const l = s.loans.find((x) => x.num === Number(f.dataset.still));
      const holder = form.get("holder"),
        expect = form.get("expect");
      if (!l || l.back || !people.includes(holder) || !(expect in dueAt))
        return;
      // The slip stays open, in the collector's name, with its original due time.
      Object.assign(l, { holder, expect, noted: s.phase });
      s.noting = 0;
      focusBack = noteButton(l.num);
      commit(
        "Slip L-" +
          l.num +
          " still out: with " +
          holder +
          ", expected " +
          expect +
          ".",
      );
      return;
    }
    if (!f.matches("[data-issue]")) return;
    const [req, asset, who, due] = ["req", "asset", "who", "due"].map((k) =>
      form.get(k),
    );
    const unit = getAsset(asset),
      r = getReq(req);
    if (!r || !unit || unit.repair || out(asset) || !people.includes(who))
      return;
    if (!r.items.includes(unit.type)) {
      q("[data-status]").textContent =
        "This equipment type is outside the approved request. Choose an approved unit.";
      return;
    }
    if (
      s.loans.some(
        (l) => l.req === req && !l.back && getAsset(l.asset).type === unit.type,
      )
    ) {
      q("[data-status]").textContent =
        "The approved quantity of this equipment type is already on loan.";
      return;
    }
    const num = Math.max(...s.loans.map((l) => l.num)) + 1;
    s.loans.push({ num, req, asset, who, due, back: false });
    s.undo = 0;
    s.editing = false;
    commit("Issued " + asset + " to " + who + " on slip L-" + num + ".");
  });
  function restore(d) {
    if (
      !d ||
      d.version !== 1 ||
      !Object.hasOwn(screens, d.tab) ||
      !shifts[d.phase] ||
      (d.selected && !getReq(d.selected)) ||
      !Array.isArray(d.notes) ||
      !d.notes.every(
        (n) => n && shifts[n.phase] && typeof n.text === "string",
      ) ||
      !Array.isArray(d.loans) ||
      !d.loans.length ||
      !d.loans.every(
        (l) =>
          l &&
          getReq(l.req) &&
          getAsset(l.asset) &&
          Number.isInteger(l.num) &&
          (l.holder == null ||
            (people.includes(l.holder) && l.expect in dueAt && shifts[l.noted])),
      )
    )
      return;
    s = {
      ...original(),
      ...d,
      loans: d.loans.map((l) => ({ ...l })),
      notes: d.notes.map((n) => ({ ...n })),
    };
    if (!s.loans.some((l) => l.num === s.noting && !l.back)) s.noting = 0;
    if (!s.loans.some((l) => l.num === s.undo && l.back)) s.undo = 0;
    paint();
  }
  paint();
  try {
    restore(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    // Keep the fresh shift when storage is unavailable or the saved data is invalid.
  }
})();
