(() => {
  "use strict";

  const STORAGE_KEYS = {
    settings: "apexDispatch.settings.v1",
    restaurants: "apexDispatch.restaurants.v1",
    shift: "apexDispatch.shift.v1",
  };

  const defaultSettings = {
    vehicleCost: 0.50,
    coreGrossPerMile: 1.75,
    conditionalGrossPerMile: 2.25,
    outerGrossPerMile: 2.50,
    minimumPayout: 7.00,
    targetGrossHourly: 25,
    strongGrossHourly: 30,
    maxOrderMinutes: 30,
  };

  const defaultShift = {
    state: "off",
    startedAt: null,
    breakStartedAt: null,
    totalBreakMs: 0,
    logs: [],
  };

  let settings = loadJson(STORAGE_KEYS.settings, defaultSettings);
  let restaurants = loadJson(STORAGE_KEYS.restaurants, []);
  let shift = loadJson(STORAGE_KEYS.shift, defaultShift);
  let lastOffer = null;
  let deferredInstallPrompt = null;

  const $ = (id) => document.getElementById(id);
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;
  const oneDecimal = (value) => Number(value || 0).toFixed(1);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      const parsed = JSON.parse(raw);
      if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : structuredClone(fallback);
      return { ...fallback, ...parsed };
    } catch {
      return structuredClone(fallback);
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readNumber(id, fallback = 0) {
    const value = Number($(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function getRestaurantIntel(name) {
    const normalized = String(name || "").trim().toLowerCase();
    return restaurants.find((entry) => entry.name.trim().toLowerCase() === normalized) || null;
  }

  function zoneThreshold(zone) {
    if (zone === "conditional") return settings.conditionalGrossPerMile;
    if (zone === "outer") return settings.outerGrossPerMile;
    return settings.coreGrossPerMile;
  }

  function evaluateOffer(data) {
    const operationalMiles = Math.max(0.1, data.displayedMiles + data.returnMiles);
    const restaurantIntel = getRestaurantIntel(data.merchant);
    const intelligenceWait = restaurantIntel ? restaurantIntel.wait : data.waitMinutes;
    const waitMinutes = Math.max(data.waitMinutes, intelligenceWait || 0);
    const shoppingMinutes = data.platform.includes("Shop") ? Math.max(0, data.itemCount * 1.25) : 0;
    const stopPenaltyMinutes = Math.max(0, data.stops - 1) * 7;
    const accessPenaltyMinutes = data.apartment ? 6 : 0;
    const totalMinutes = Math.max(1, waitMinutes + data.driveMinutes + shoppingMinutes + stopPenaltyMinutes + accessPenaltyMinutes);
    const vehicleCost = operationalMiles * settings.vehicleCost;
    const netBeforeTax = data.payout - vehicleCost;
    const grossPerMile = data.payout / operationalMiles;
    const netPerMile = netBeforeTax / operationalMiles;
    const grossHourly = data.payout / (totalMinutes / 60);
    const netHourly = netBeforeTax / (totalMinutes / 60);
    const requiredPerMile = zoneThreshold(data.zone);

    let score = 50;
    score += clamp((grossPerMile - requiredPerMile) * 16, -32, 28);
    score += clamp((grossHourly - settings.targetGrossHourly) * 1.4, -24, 22);
    score += clamp((data.payout - settings.minimumPayout) * 2.2, -16, 16);
    score += clamp((settings.maxOrderMinutes - totalMinutes) * 0.7, -15, 10);

    if (restaurantIntel) {
      const gradeAdjustment = { A: 8, B: 2, C: -8, D: -18 }[restaurantIntel.grade] || 0;
      score += gradeAdjustment;
    }
    if (data.apartment) score -= 7;
    if (data.heavyItems) score -= 8;
    if (data.stops > 1) score -= Math.min(12, (data.stops - 1) * 4);
    if (data.peakWindow && totalMinutes > 32) score -= 7;
    if (data.endsNearHome) score += 7;
    if (data.platform.includes("Shop") && data.itemCount > 20) score -= 10;
    if (data.platform.includes("Shop") && data.itemCount <= 10 && data.payout >= 15) score += 8;
    if (data.zone === "outer") score -= 7;

    score = Math.round(clamp(score, 0, 100));

    const hardDecline =
      data.payout < settings.minimumPayout - 2 ||
      grossPerMile < requiredPerMile * 0.72 ||
      netBeforeTax <= 2 ||
      (data.zone === "outer" && grossPerMile < settings.outerGrossPerMile);

    let verdict = "MAYBE";
    if (hardDecline || score < 48) verdict = "DECLINE";
    else if (score >= 68 && grossPerMile >= requiredPerMile && grossHourly >= settings.targetGrossHourly) verdict = "ACCEPT";

    const reasons = [];
    const risks = [];

    if (grossPerMile >= requiredPerMile + 0.5) reasons.push("Strong gross dollars per operational mile.");
    else if (grossPerMile >= requiredPerMile) reasons.push("Meets the territory-specific mileage threshold.");
    else risks.push(`Below the ${money(requiredPerMile)} gross-per-mile threshold for this zone.`);

    if (grossHourly >= settings.strongGrossHourly) reasons.push("Projected hourly rate is in the strong range.");
    else if (grossHourly >= settings.targetGrossHourly) reasons.push("Projected hourly rate meets target.");
    else risks.push("Projected hourly rate is below target.");

    if (restaurantIntel?.grade === "A") reasons.push("Restaurant is graded A in local intelligence.");
    if (restaurantIntel?.grade === "C" || restaurantIntel?.grade === "D") risks.push(`Restaurant is graded ${restaurantIntel.grade} and carries delay risk.`);
    if (data.returnMiles > 0) risks.push(`${oneDecimal(data.returnMiles)} estimated return miles are included.`);
    if (data.apartment) risks.push("Access complexity may extend completion time.");
    if (data.heavyItems) risks.push("Heavy-item handling risk applies.");
    if (data.zone === "outer") risks.push("Outer-zone drop-off can reduce next-order availability.");
    if (data.platform.includes("Shop") && data.itemCount > 15) risks.push("Shopping item count may create substitution and checkout delays.");
    if (data.endsNearHome) reasons.push("Final-order positioning benefit reduces deadhead cost.");

    const dispatcherInstructions = [];
    const driverInstructions = [];

    if (verdict === "ACCEPT") {
      dispatcherInstructions.push("Recommend ACCEPT immediately if the route and merchant shown in DoorDash match the entered data.");
      dispatcherInstructions.push("Set the recovery point before pickup: nearest productive restaurant cluster after drop-off.");
      dispatcherInstructions.push("Start timing the restaurant wait and update the merchant grade after completion.");
      driverInstructions.push("JF makes the final acceptance in DoorDash and confirms the displayed route before moving.");
      driverInstructions.push("Drive to pickup, verify the correct order, and report any delay to BL.");
    } else if (verdict === "MAYBE") {
      dispatcherInstructions.push("Recommend MAYBE: accept only if the restaurant is currently running on time and the destination does not create extra deadhead mileage.");
      dispatcherInstructions.push("Recheck traffic, parking, and whether a stronger peak-period offer is likely within the next few minutes.");
      driverInstructions.push("JF should accept only after confirming there are no hidden access, traffic, or route problems.");
    } else {
      dispatcherInstructions.push("Recommend DECLINE and remain parked in the current productive staging area.");
      dispatcherInstructions.push("Do not reposition solely because of this declined offer; wait for a qualifying order unless the zone has been inactive.");
      driverInstructions.push("JF declines manually and maintains safe staging. Do not chase the hotspot marker without a dispatch reason.");
    }

    return {
      ...data,
      operationalMiles,
      totalMinutes,
      vehicleCost,
      netBeforeTax,
      grossPerMile,
      netPerMile,
      grossHourly,
      netHourly,
      requiredPerMile,
      restaurantIntel,
      score,
      verdict,
      reasons,
      risks,
      dispatcherInstructions,
      driverInstructions,
    };
  }

  function readOfferForm() {
    return {
      platform: $("platform").value,
      payout: readNumber("payout"),
      displayedMiles: readNumber("displayedMiles"),
      returnMiles: readNumber("returnMiles"),
      merchant: $("merchant").value.trim(),
      zone: $("zone").value,
      waitMinutes: readNumber("waitMinutes", 8),
      driveMinutes: readNumber("driveMinutes", 18),
      stops: Math.max(1, readNumber("stops", 1)),
      itemCount: Math.max(0, readNumber("itemCount", 0)),
      apartment: $("apartment").checked,
      heavyItems: $("heavyItems").checked,
      peakWindow: $("peakWindow").checked,
      endsNearHome: $("endsNearHome").checked,
    };
  }

  function renderOfferResult(result) {
    lastOffer = result;
    const badge = $("verdictBadge");
    badge.textContent = result.verdict;
    badge.className = `verdict verdict-${result.verdict.toLowerCase()}`;

    const summaryParts = [];
    if (result.reasons.length) summaryParts.push(result.reasons.join(" "));
    if (result.risks.length) summaryParts.push(`Risk: ${result.risks.join(" ")}`);
    $("decisionSummary").textContent = summaryParts.join(" ") || "Offer scored with neutral indicators.";

    $("scoreMetric").textContent = `${result.score}/100`;
    $("operationalMilesMetric").textContent = `${oneDecimal(result.operationalMiles)} mi`;
    $("grossPerMileMetric").textContent = money(result.grossPerMile);
    $("netPerMileMetric").textContent = money(result.netPerMile);
    $("grossHourlyMetric").textContent = `${money(result.grossHourly)}/hr`;
    $("netOrderMetric").textContent = money(result.netBeforeTax);

    renderList("dispatcherInstructions", result.dispatcherInstructions);
    renderList("driverInstructions", result.driverInstructions);
    $("logAccepted").disabled = false;
    $("logDeclined").disabled = false;
  }

  function renderList(id, items) {
    $(id).innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      $(id).appendChild(li);
    });
  }

  function resetOfferForm() {
    $("offerForm").reset();
    $("waitMinutes").value = 8;
    $("driveMinutes").value = 18;
    $("stops").value = 1;
    $("itemCount").value = 0;
    $("peakWindow").checked = true;
    lastOffer = null;
    $("verdictBadge").textContent = "WAITING";
    $("verdictBadge").className = "verdict verdict-neutral";
    $("decisionSummary").textContent = "Enter the offer details to calculate profitability, time efficiency, vehicle cost, and territory risk.";
    ["scoreMetric", "operationalMilesMetric", "grossPerMileMetric", "netPerMileMetric", "grossHourlyMetric", "netOrderMetric"].forEach((id) => $(id).textContent = "—");
    renderList("dispatcherInstructions", ["Enter an offer to generate the dispatch recommendation."]);
    renderList("driverInstructions", ["JF retains control of the app, vehicle, safety decisions, and final acceptance."]);
    $("logAccepted").disabled = true;
    $("logDeclined").disabled = true;
  }

  function addOfferLog(status) {
    if (!lastOffer) return;
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status,
      merchant: lastOffer.merchant || lastOffer.platform,
      payout: 0,
      offeredPayout: lastOffer.payout,
      miles: 0,
      offeredMiles: lastOffer.operationalMiles,
      minutes: 0,
      offeredMinutes: lastOffer.totalMinutes,
      net: 0,
      estimatedNet: lastOffer.netBeforeTax,
      score: lastOffer.score,
      verdict: lastOffer.verdict,
    };
    shift.logs.unshift(entry);
    saveShift();
    renderShift();
  }

  function addCompletedDelivery(data) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: "Completed",
      merchant: data.merchant || "Manual delivery",
      payout: data.payout,
      offeredPayout: data.payout,
      miles: data.miles,
      minutes: data.minutes,
      net: data.payout - data.miles * settings.vehicleCost,
      score: null,
      verdict: "ACTUAL",
    };
    shift.logs.unshift(entry);
    saveShift();
    renderShift();
  }

  function saveShift() {
    saveJson(STORAGE_KEYS.shift, shift);
  }

  function activeElapsedMs() {
    if (!shift.startedAt) return 0;
    const end = shift.state === "off" && shift.endedAt ? shift.endedAt : Date.now();
    let breakMs = shift.totalBreakMs || 0;
    if (shift.state === "break" && shift.breakStartedAt) breakMs += Date.now() - shift.breakStartedAt;
    return Math.max(0, end - shift.startedAt - breakMs);
  }

  function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function shiftTotals() {
    const completed = shift.logs.filter((entry) => entry.status === "Completed");
    const gross = completed.reduce((sum, entry) => sum + Number(entry.payout || 0), 0);
    const miles = completed.reduce((sum, entry) => sum + Number(entry.miles || 0), 0);
    const cost = miles * settings.vehicleCost;
    const net = gross - cost;
    const activeHours = activeElapsedMs() / 3600000;
    const grossHourly = activeHours > 0 ? gross / activeHours : 0;
    const netPerMile = miles > 0 ? net / miles : 0;
    return { gross, miles, cost, net, activeHours, grossHourly, netPerMile, completedCount: completed.length };
  }

  function renderShift() {
    const status = $("shiftStatus");
    status.className = "status-pill";
    if (shift.state === "active") {
      status.textContent = "Shift active";
      status.classList.add("status-on");
    } else if (shift.state === "break") {
      status.textContent = "On break";
      status.classList.add("status-break");
    } else {
      status.textContent = "Shift off";
      status.classList.add("status-off");
    }

    $("startShift").disabled = shift.state !== "off";
    $("startBreak").disabled = shift.state !== "active";
    $("endBreak").disabled = shift.state !== "break";
    $("endShift").disabled = shift.state === "off";

    const totals = shiftTotals();
    $("elapsedMetric").textContent = formatDuration(activeElapsedMs());
    $("shiftGrossMetric").textContent = money(totals.gross);
    $("shiftMilesMetric").textContent = oneDecimal(totals.miles);
    $("shiftCostMetric").textContent = money(totals.cost);
    $("shiftNetMetric").textContent = money(totals.net);
    $("shiftHourlyMetric").textContent = money(totals.grossHourly);

    const body = $("deliveryLogBody");
    body.innerHTML = "";
    if (!shift.logs.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">No deliveries logged.</td></tr>';
    } else {
      shift.logs.forEach((entry) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
          <td>${escapeHtml(entry.status)}</td>
          <td>${escapeHtml(entry.merchant)}</td>
          <td>${entry.status === "Completed" ? money(entry.payout) : `~${money(entry.offeredPayout)}`}</td>
          <td>${entry.status === "Completed" ? oneDecimal(entry.miles) : `~${oneDecimal(entry.offeredMiles || 0)}`}</td>
          <td>${entry.status === "Completed" ? (entry.minutes || 0) : `~${entry.offeredMinutes || 0}`}</td>
          <td>${entry.status === "Completed" ? money(entry.net) : `~${money(entry.estimatedNet || 0)}`}</td>
        `;
        body.appendChild(tr);
      });
    }

    renderKpiAlerts(totals);
  }

  function renderKpiAlerts(totals) {
    const alerts = [];
    if (totals.completedCount === 0) {
      alerts.push({ type: "warn", text: "No completed deliveries logged yet. KPIs will update as the shift progresses." });
    } else {
      alerts.push({
        type: totals.grossHourly >= settings.targetGrossHourly ? "good" : "warn",
        text: `Gross active-hour rate: ${money(totals.grossHourly)} versus ${money(settings.targetGrossHourly)} target.`,
      });
      alerts.push({
        type: totals.netPerMile >= 1.75 ? "good" : "bad",
        text: `Estimated net per mile: ${money(totals.netPerMile)}. Target is at least $1.75 after the vehicle-cost allowance.`,
      });
      alerts.push({
        type: totals.miles <= totals.gross / 1.75 ? "good" : "warn",
        text: `Mileage discipline: ${oneDecimal(totals.miles)} miles against ${money(totals.gross)} gross.`,
      });
    }

    $("kpiAlerts").innerHTML = alerts.map((alert) => `<div class="alert ${alert.type}">${escapeHtml(alert.text)}</div>`).join("");
  }

  function renderRestaurants() {
    const body = $("restaurantTableBody");
    body.innerHTML = "";
    if (!restaurants.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No restaurant intelligence saved.</td></tr>';
      return;
    }

    [...restaurants].sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(entry.name)}</td>
        <td><span class="grade grade-${entry.grade}">${entry.grade}</span></td>
        <td>${entry.wait} min</td>
        <td>${escapeHtml(entry.notes || "")}</td>
        <td><button class="text-button delete-restaurant" data-id="${entry.id}">Delete</button></td>
      `;
      body.appendChild(tr);
    });
  }

  function populateSettings() {
    Object.keys(defaultSettings).forEach((key) => {
      if ($(key)) $(key).value = settings[key];
    });
  }

  function exportCsv() {
    const headers = ["timestamp", "status", "merchant", "payout", "offered_payout", "miles", "minutes", "estimated_net", "score", "verdict"];
    const rows = shift.logs.map((entry) => [
      new Date(entry.timestamp).toISOString(),
      entry.status,
      entry.merchant,
      entry.payout,
      entry.offeredPayout,
      entry.miles,
      entry.minutes,
      entry.net,
      entry.score ?? "",
      entry.verdict,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `apex-dispatch-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
        button.classList.add("active");
        $(button.dataset.tab).classList.add("active");
      });
    });
  }

  function setupEvents() {
    $("offerForm").addEventListener("submit", (event) => {
      event.preventDefault();
      renderOfferResult(evaluateOffer(readOfferForm()));
    });
    $("resetOffer").addEventListener("click", resetOfferForm);
    $("logAccepted").addEventListener("click", () => addOfferLog("Accepted"));
    $("logDeclined").addEventListener("click", () => addOfferLog("Declined"));

    $("startShift").addEventListener("click", () => {
      shift = { ...defaultShift, state: "active", startedAt: Date.now(), logs: shift.logs || [] };
      saveShift();
      renderShift();
    });
    $("startBreak").addEventListener("click", () => {
      shift.state = "break";
      shift.breakStartedAt = Date.now();
      saveShift();
      renderShift();
    });
    $("endBreak").addEventListener("click", () => {
      if (shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt;
      shift.breakStartedAt = null;
      shift.state = "active";
      saveShift();
      renderShift();
    });
    $("endShift").addEventListener("click", () => {
      if (shift.state === "break" && shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt;
      shift.breakStartedAt = null;
      shift.state = "off";
      shift.endedAt = Date.now();
      saveShift();
      renderShift();
    });

    $("manualCompletedForm").addEventListener("submit", (event) => {
      event.preventDefault();
      addCompletedDelivery({
        payout: readNumber("completedPayout"),
        miles: readNumber("completedMiles"),
        minutes: readNumber("completedMinutes"),
        merchant: $("completedMerchant").value.trim(),
      });
      event.target.reset();
    });

    $("restaurantForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = $("restaurantName").value.trim();
      const existing = restaurants.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
      const record = {
        id: existing?.id || crypto.randomUUID(),
        name,
        grade: $("restaurantGrade").value,
        wait: readNumber("restaurantWait", 8),
        notes: $("restaurantNotes").value.trim(),
      };
      restaurants = existing ? restaurants.map((entry) => entry.id === existing.id ? record : entry) : [...restaurants, record];
      saveJson(STORAGE_KEYS.restaurants, restaurants);
      renderRestaurants();
      event.target.reset();
      $("restaurantWait").value = 8;
    });

    $("restaurantTableBody").addEventListener("click", (event) => {
      const button = event.target.closest(".delete-restaurant");
      if (!button) return;
      restaurants = restaurants.filter((entry) => entry.id !== button.dataset.id);
      saveJson(STORAGE_KEYS.restaurants, restaurants);
      renderRestaurants();
    });

    $("settingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      settings = Object.fromEntries(Object.keys(defaultSettings).map((key) => [key, readNumber(key, defaultSettings[key])]));
      saveJson(STORAGE_KEYS.settings, settings);
      renderShift();
      alert("Settings saved.");
    });

    $("exportCsv").addEventListener("click", exportCsv);
    $("clearShiftData").addEventListener("click", () => {
      if (!confirm("Clear all current shift logs and timers?")) return;
      shift = structuredClone(defaultShift);
      saveShift();
      renderShift();
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $("installButton").hidden = false;
    });
    $("installButton").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $("installButton").hidden = true;
    });
  }

  setupTabs();
  setupEvents();
  populateSettings();
  renderRestaurants();
  renderShift();
  resetOfferForm();
  setInterval(renderShift, 30000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
})();
